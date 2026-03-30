import { EventEmitter } from 'node:events'

import { spawn } from 'node-pty'

import type { TunnelSessionState } from '../shared/contracts'

interface Disposable {
  dispose(): void
}

interface PtyLikeProcess {
  write(data: string): void
  onData(listener: (data: string) => void): Disposable
  onExit(listener: (event: { exitCode: number }) => void): Disposable
  kill(signal?: NodeJS.Signals | number): boolean
}

interface ProcessSpawner {
  spawn(file: string, args: string[], env: Record<string, string>): PtyLikeProcess
}

interface ReconnectHandle {
  cancel(): void
}

interface ReconnectScheduler {
  scheduleReconnect(callback: () => void): ReconnectHandle
}

interface OpenTunnelSessionOptions {
  profileId: string
  profileName: string
  region: string
  jumpInstanceId: string
  jumpInstanceName: string
  targetName: string
  targetKind: 'db' | 'redis'
  targetEndpoint: string
  remotePort: number
  localPort: number
  awsCliPath: string
  env: Record<string, string>
}

interface TunnelSessionRecord {
  session: TunnelSessionState
  process: PtyLikeProcess
  reconnectHandle: ReconnectHandle | null
  stoppedByUser: boolean
  options: OpenTunnelSessionOptions
}

function createSessionId(): string {
  return `tunnel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function shellQuote(value: string): string {
  return /[\s'"]/.test(value) ? `'${value.replaceAll("'", "'\\''")}'` : value
}

function buildTunnelCommand(options: OpenTunnelSessionOptions): { file: string; args: string[] } {
  const shell = process.env['SHELL'] ?? '/bin/zsh'
  const parameters = JSON.stringify({
    host: [options.targetEndpoint],
    portNumber: [String(options.remotePort)],
    localPortNumber: [String(options.localPort)]
  })

  return {
    file: shell,
    args: [
      '-lc',
      `${shellQuote(options.awsCliPath)} --region ${options.region} ssm start-session --target ${options.jumpInstanceId} --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters '${parameters}'`
    ]
  }
}

function defaultSpawn(file: string, args: string[], env: Record<string, string>): PtyLikeProcess {
  return spawn(file, args, {
    name: 'xterm-color',
    cols: 120,
    rows: 30,
    cwd: process.cwd(),
    env: {
      ...(process.env as Record<string, string>),
      ...env
    }
  })
}

function defaultReconnectScheduler(): ReconnectScheduler {
  return {
    scheduleReconnect(callback) {
      const timeout = setTimeout(callback, 3000)
      return {
        cancel() {
          clearTimeout(timeout)
        }
      }
    }
  }
}

export class TunnelSessionManager extends EventEmitter {
  readonly #sessions = new Map<string, TunnelSessionRecord>()
  readonly #processSpawner: ProcessSpawner
  readonly #reconnectScheduler: ReconnectScheduler

  constructor(
    processSpawner: ProcessSpawner = { spawn: defaultSpawn },
    reconnectScheduler: ReconnectScheduler = defaultReconnectScheduler()
  ) {
    super()
    this.#processSpawner = processSpawner
    this.#reconnectScheduler = reconnectScheduler
  }

  async openTunnelSession(options: OpenTunnelSessionOptions): Promise<TunnelSessionState> {
    const id = createSessionId()
    const session: TunnelSessionState = {
      id,
      targetName: options.targetName,
      targetKind: options.targetKind,
      targetEndpoint: options.targetEndpoint,
      remotePort: options.remotePort,
      localPort: options.localPort,
      jumpInstanceId: options.jumpInstanceId,
      jumpInstanceName: options.jumpInstanceName,
      profileId: options.profileId,
      profileName: options.profileName,
      region: options.region,
      status: 'connecting',
      openedAt: Date.now()
    }

    this.#startProcess(id, session, options)
    return session
  }

  #startProcess(id: string, session: TunnelSessionState, options: OpenTunnelSessionOptions): void {
    const command = buildTunnelCommand(options)
    const process = this.#processSpawner.spawn(command.file, command.args, options.env)
    const record: TunnelSessionRecord = {
      session,
      process,
      reconnectHandle: null,
      stoppedByUser: false,
      options
    }

    this.#sessions.set(id, record)
    this.emit('log', {
      sessionId: id,
      data: `Starting tunnel to ${options.targetEndpoint}:${options.remotePort} via ${options.jumpInstanceId}\r\n`
    })

    process.onData((data) => {
      session.status = 'open'
      this.emit('log', {
        sessionId: id,
        data
      })
    })

    process.onExit(({ exitCode }) => {
      if (!this.#sessions.has(id)) {
        return
      }

      if (record.stoppedByUser) {
        session.status = 'closed'
        this.#sessions.delete(id)
        this.emit('exit', { sessionId: id, code: exitCode })
        return
      }

      if (exitCode === 0) {
        session.status = 'reconnecting'
        this.emit('log', {
          sessionId: id,
          data: '\r\nTunnel session ended cleanly. Reconnecting in 3 seconds...\r\n'
        })
        record.reconnectHandle = this.#reconnectScheduler.scheduleReconnect(() => {
          record.reconnectHandle = null
          this.#startProcess(id, session, options)
        })
        return
      }

      session.status = 'error'
      this.#sessions.delete(id)
      this.emit('error', {
        sessionId: id,
        message: `Tunnel session exited with code ${exitCode}`
      })
      this.emit('exit', { sessionId: id, code: exitCode })
    })
  }

  getSession(sessionId: string): TunnelSessionState | undefined {
    return this.#sessions.get(sessionId)?.session
  }

  listSessions(): TunnelSessionState[] {
    return [...this.#sessions.values()].map((record) => record.session)
  }

  async closeTunnelSession(sessionId: string): Promise<void> {
    const record = this.#sessions.get(sessionId)

    if (!record) {
      return
    }

    record.stoppedByUser = true
    record.reconnectHandle?.cancel()
    record.reconnectHandle = null
    record.process.kill('SIGTERM')
    this.#sessions.delete(sessionId)
  }

  async closeAllTunnelSessions(): Promise<void> {
    await Promise.all(this.listSessions().map((session) => this.closeTunnelSession(session.id)))
  }
}
