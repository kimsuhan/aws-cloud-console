import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

import { SsmSessionManager } from './ssm-session-manager'

class FakeChildProcess extends EventEmitter {
  writes: string[] = []
  killed = false
  onDataCallback: ((data: string) => void) | null = null
  onExitCallback: ((event: { exitCode: number }) => void) | null = null

  write(chunk: string): void {
    this.writes.push(chunk)
  }

  onData(listener: (data: string) => void): { dispose(): void } {
    this.onDataCallback = listener
    return {
      dispose: () => {
        this.onDataCallback = null
      }
    }
  }

  onExit(listener: (event: { exitCode: number }) => void): { dispose(): void } {
    this.onExitCallback = listener
    return {
      dispose: () => {
        this.onExitCallback = null
      }
    }
  }

  kill(): boolean {
    this.killed = true
    this.onExitCallback?.({ exitCode: 0 })
    return true
  }
}

test('openSession creates tracked session and forwards terminal input', async () => {
  const spawned: { file: string | null; args: string[] | null } = { file: null, args: null }
  const child = new FakeChildProcess()
  const manager = new SsmSessionManager({
    spawn(file, args) {
      spawned.file = file
      spawned.args = args
      return child
    }
  })

  const session = await manager.openSession({
    profileName: 'dev-admin',
    region: 'ap-northeast-2',
    instanceId: 'i-123',
    instanceName: 'api-server'
  })

  manager.sendInput(session.id, 'ls\n')

  assert.equal(session.instanceId, 'i-123')
  assert.equal(child.writes[0], 'ls\n')
  assert.equal(spawned.file, process.env['SHELL'] ?? '/bin/zsh')
  assert.deepEqual(spawned.args, [
    '-lc',
    'aws --profile dev-admin --region ap-northeast-2 ssm start-session --target i-123'
  ])
})

test('closeSession removes session and kills backing process', async () => {
  const child = new FakeChildProcess()
  const manager = new SsmSessionManager({
    spawn() {
      return child
    }
  })

  const session = await manager.openSession({
    profileName: 'dev-admin',
    region: 'ap-northeast-2',
    instanceId: 'i-123',
    instanceName: 'api-server'
  })

  await manager.closeSession(session.id)

  assert.equal(child.killed, true)
  assert.equal(manager.getSession(session.id), undefined)
})
