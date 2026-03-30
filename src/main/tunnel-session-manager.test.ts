import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

import { TunnelSessionManager } from './tunnel-session-manager'

class FakeTunnelProcess extends EventEmitter {
  writes: string[] = []
  exitListener: ((event: { exitCode: number }) => void) | null = null
  dataListener: ((data: string) => void) | null = null
  killed = false

  write(data: string): void {
    this.writes.push(data)
  }

  onData(listener: (data: string) => void): { dispose(): void } {
    this.dataListener = listener
    return {
      dispose: () => {
        this.dataListener = null
      }
    }
  }

  onExit(listener: (event: { exitCode: number }) => void): { dispose(): void } {
    this.exitListener = listener
    return {
      dispose: () => {
        this.exitListener = null
      }
    }
  }

  kill(): boolean {
    this.killed = true
    this.exitListener?.({ exitCode: 130 })
    return true
  }
}

test('openTunnelSession spawns the AWS port forwarding command through the shell', async () => {
  const process = new FakeTunnelProcess()
  const spawned: { file: string | null; args: string[] | null } = { file: null, args: null }
  const manager = new TunnelSessionManager({
    spawn(file, args) {
      spawned.file = file
      spawned.args = args
      return process
    },
    scheduleReconnect() {
      return {
        cancel() {}
      }
    }
  })

  const session = await manager.openTunnelSession({
    profileName: 'ility',
    region: 'ap-southeast-1',
    jumpInstanceId: 'i-bastion',
    jumpInstanceName: 'ility-bastion',
    targetName: 'ility-db',
    targetKind: 'db',
    targetEndpoint: 'ility-db.abc.apse1.rds.amazonaws.com',
    remotePort: 5432,
    localPort: 54320
  })

  assert.equal(spawned.file, '/bin/zsh')
  assert.deepEqual(spawned.args, [
    '-lc',
    'aws --profile ility --region ap-southeast-1 ssm start-session --target i-bastion --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters \'{"host":["ility-db.abc.apse1.rds.amazonaws.com"],"portNumber":["5432"],"localPortNumber":["54320"]}\''
  ])
  assert.equal(session.localPort, 54320)
  assert.equal(session.targetName, 'ility-db')
})

test('closeTunnelSession kills the process and removes the session', async () => {
  const process = new FakeTunnelProcess()
  const manager = new TunnelSessionManager({
    spawn() {
      return process
    },
    scheduleReconnect() {
      return {
        cancel() {}
      }
    }
  })

  const session = await manager.openTunnelSession({
    profileName: 'ility',
    region: 'ap-southeast-1',
    jumpInstanceId: 'i-bastion',
    jumpInstanceName: 'ility-bastion',
    targetName: 'ility-db',
    targetKind: 'db',
    targetEndpoint: 'ility-db.abc.apse1.rds.amazonaws.com',
    remotePort: 5432,
    localPort: 54320
  })

  await manager.closeTunnelSession(session.id)

  assert.equal(process.killed, true)
  assert.equal(manager.getSession(session.id), undefined)
})
