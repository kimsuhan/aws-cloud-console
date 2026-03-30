import { EventEmitter } from 'node:events'

import { spawn } from 'node-pty'

import type { SessionTabState } from '../shared/contracts'

export interface OpenSessionOptions {
  profileId: string
  profileName: string
  region: string
  instanceId: string
  instanceName: string
  awsCliPath: string
  env: Record<string, string>
}

interface SessionRecord {
  session: SessionTabState
  child: PtyLikeProcess
}

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

function shellQuote(value: string): string {
  return /[\s'"]/.test(value) ? `'${value.replaceAll("'", "'\\''")}'` : value
}

function createSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function buildSsmCommand(options: OpenSessionOptions): { file: string; args: string[] } {
  const shell = process.env['SHELL'] ?? '/bin/zsh'

  return {
    file: shell,
    args: ['-lc', `${shellQuote(options.awsCliPath)} --region ${options.region} ssm start-session --target ${options.instanceId}`]
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

export class SsmSessionManager extends EventEmitter {
  readonly #sessions = new Map<string, SessionRecord>()
  readonly #processSpawner: ProcessSpawner

  constructor(processSpawner: ProcessSpawner = { spawn: defaultSpawn }) {
    super()
    this.#processSpawner = processSpawner
  }

  async openSession(options: OpenSessionOptions): Promise<SessionTabState> {
    const id = createSessionId()
    const command = buildSsmCommand(options)

    const child = this.#processSpawner.spawn(command.file, command.args, options.env)
    const session: SessionTabState = {
      id,
      title: options.instanceName,
      instanceId: options.instanceId,
      instanceName: options.instanceName,
      profileId: options.profileId,
      profileName: options.profileName,
      region: options.region,
      status: 'connecting',
      openedAt: Date.now()
    }

    this.#sessions.set(id, { session, child })

    child.onData((data) => {
      session.status = 'open'
      this.emit('output', {
        sessionId: id,
        stream: 'stdout',
        data
      })
    })

    child.onExit(({ exitCode }) => {
      session.status = exitCode === 0 ? 'closed' : 'error'
      this.#sessions.delete(id)
      if (exitCode !== 0) {
        console.error(`[ssm] session ${id} exited with code ${exitCode}`)
      }
      this.emit('exit', {
        sessionId: id,
        code: exitCode
      })
    })

    return session
  }

  getSession(sessionId: string): SessionTabState | undefined {
    return this.#sessions.get(sessionId)?.session
  }

  listSessions(): SessionTabState[] {
    return [...this.#sessions.values()].map((record) => record.session)
  }

  sendInput(sessionId: string, data: string): void {
    this.#sessions.get(sessionId)?.child.write(data)
  }

  resizeSession(_sessionId: string, _cols: number, _rows: number): void {
    // node-pty gives us a PTY-backed session, but start-session itself does not need explicit resize handling yet.
  }

  async closeSession(sessionId: string): Promise<void> {
    const record = this.#sessions.get(sessionId)

    if (!record) {
      return
    }

    record.child.kill('SIGTERM')
    this.#sessions.delete(sessionId)
  }

  async closeAllSessions(): Promise<void> {
    await Promise.all(this.listSessions().map((session) => this.closeSession(session.id)))
  }
}
