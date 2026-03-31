import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

import { SsmSessionManager } from './ssm-session-manager'

class FakeChildProcess extends EventEmitter {
  writes: string[] = []
  killed = false
  resized: Array<{ cols: number; rows: number }> = []
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

  resize(cols: number, rows: number): void {
    this.resized.push({ cols, rows })
  }
}

test('openSession creates tracked session and forwards terminal input', async () => {
  const spawned: {
    file: string | null
    args: string[] | null
    env: Record<string, string> | null
    cols: number | null
    rows: number | null
  } = {
    file: null,
    args: null,
    env: null,
    cols: null,
    rows: null
  }
  const child = new FakeChildProcess()
  const manager = new SsmSessionManager({
    spawn(file, args, env, cols, rows) {
      spawned.file = file
      spawned.args = args
      spawned.env = env
      spawned.cols = cols
      spawned.rows = rows
      return child
    }
  })

  const session = await manager.openSession({
    profileId: 'profile-1',
    profileName: 'dev-admin',
    region: 'ap-northeast-2',
    instanceId: 'i-123',
    instanceName: 'api-server',
    cols: 148,
    rows: 42,
    awsCliPath: '/opt/homebrew/bin/aws',
    env: {
      AWS_ACCESS_KEY_ID: 'AKIADEVADMIN',
      AWS_SECRET_ACCESS_KEY: 'secret',
      AWS_SESSION_TOKEN: 'token-123',
      AWS_REGION: 'ap-northeast-2',
      AWS_DEFAULT_REGION: 'ap-northeast-2'
    }
  })

  manager.sendInput(session.id, 'ls\n')

  assert.equal(session.instanceId, 'i-123')
  assert.equal(child.writes[0], 'ls\n')
  assert.equal(spawned.file, '/opt/homebrew/bin/aws')
  assert.deepEqual(spawned.args, [
    '--region',
    'ap-northeast-2',
    'ssm',
    'start-session',
    '--target',
    'i-123'
  ])
  assert.deepEqual(spawned.env, {
    AWS_ACCESS_KEY_ID: 'AKIADEVADMIN',
    AWS_SECRET_ACCESS_KEY: 'secret',
    AWS_SESSION_TOKEN: 'token-123',
    AWS_REGION: 'ap-northeast-2',
    AWS_DEFAULT_REGION: 'ap-northeast-2',
    TERM: 'xterm-256color'
  })
  assert.equal(spawned.cols, 148)
  assert.equal(spawned.rows, 42)
  assert.deepEqual(child.resized, [{ cols: 148, rows: 42 }])
})

test('closeSession removes session and kills backing process', async () => {
  const child = new FakeChildProcess()
  const manager = new SsmSessionManager({
    spawn() {
      return child
    }
  })

  const session = await manager.openSession({
    profileId: 'profile-1',
    profileName: 'dev-admin',
    region: 'ap-northeast-2',
    instanceId: 'i-123',
    instanceName: 'api-server',
    cols: 120,
    rows: 30,
    awsCliPath: '/opt/homebrew/bin/aws',
    env: {
      AWS_ACCESS_KEY_ID: 'AKIADEVADMIN',
      AWS_SECRET_ACCESS_KEY: 'secret',
      AWS_REGION: 'ap-northeast-2',
      AWS_DEFAULT_REGION: 'ap-northeast-2'
    }
  })

  await manager.closeSession(session.id)

  assert.equal(child.killed, true)
  assert.equal(manager.getSession(session.id), undefined)
})

test('resizeSession forwards dimensions to the backing pty', async () => {
  const child = new FakeChildProcess()
  const manager = new SsmSessionManager({
    spawn() {
      return child
    }
  })

  const session = await manager.openSession({
    profileId: 'profile-1',
    profileName: 'dev-admin',
    region: 'ap-northeast-2',
    instanceId: 'i-123',
    instanceName: 'api-server',
    cols: 100,
    rows: 24,
    awsCliPath: '/opt/homebrew/bin/aws',
    env: {
      AWS_ACCESS_KEY_ID: 'AKIADEVADMIN',
      AWS_SECRET_ACCESS_KEY: 'secret',
      AWS_REGION: 'ap-northeast-2',
      AWS_DEFAULT_REGION: 'ap-northeast-2'
    }
  })

  manager.resizeSession(session.id, 132, 40)

  assert.deepEqual(child.resized, [
    { cols: 100, rows: 24 },
    { cols: 132, rows: 40 }
  ])
})

test('resizeSession ignores invalid or unchanged dimensions', async () => {
  const child = new FakeChildProcess()
  const manager = new SsmSessionManager({
    spawn() {
      return child
    }
  })

  const session = await manager.openSession({
    profileId: 'profile-1',
    profileName: 'dev-admin',
    region: 'ap-northeast-2',
    instanceId: 'i-123',
    instanceName: 'api-server',
    cols: 120,
    rows: 30,
    awsCliPath: '/opt/homebrew/bin/aws',
    env: {
      AWS_ACCESS_KEY_ID: 'AKIADEVADMIN',
      AWS_SECRET_ACCESS_KEY: 'secret',
      AWS_REGION: 'ap-northeast-2',
      AWS_DEFAULT_REGION: 'ap-northeast-2'
    }
  })

  manager.resizeSession(session.id, 120, 30)
  manager.resizeSession(session.id, 0, 0)
  manager.resizeSession(session.id, 120, 31)

  assert.deepEqual(child.resized, [
    { cols: 120, rows: 30 },
    { cols: 120, rows: 31 }
  ])
})
