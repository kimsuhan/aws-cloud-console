import { EventEmitter } from 'node:events'

import { spawn } from 'node-pty'

import type { SessionTabState } from '../shared/contracts'

export interface OpenSessionOptions {
  profileId: string
  profileName: string
  region: string
  instanceId: string
  instanceName: string
  cols: number
  rows: number
  awsCliPath: string
  env: Record<string, string>
}

interface SessionRecord {
  session: SessionTabState
  child: PtyLikeProcess
  cols: number
  rows: number
}

interface Disposable {
  dispose(): void
}

interface PtyLikeProcess {
  write(data: string): void
  resize(cols: number, rows: number): void
  onData(listener: (data: string) => void): Disposable
  onExit(listener: (event: { exitCode: number }) => void): Disposable
  kill(signal?: NodeJS.Signals | number): boolean
}

interface ProcessSpawner {
  spawn(file: string, args: string[], env: Record<string, string>, cols: number, rows: number): PtyLikeProcess
}

function createSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function buildSsmCommand(options: OpenSessionOptions): { file: string; args: string[] } {
  return {
    file: options.awsCliPath,
    args: ['--region', options.region, 'ssm', 'start-session', '--target', options.instanceId]
  }
}

function defaultSpawn(
  file: string,
  args: string[],
  env: Record<string, string>,
  cols: number,
  rows: number
): PtyLikeProcess {
  const nextEnv = {
    ...(process.env as Record<string, string>),
    ...env
  }

  return spawn(file, args, {
    name: nextEnv['TERM'] ?? 'xterm-256color',
    cols,
    rows,
    cwd: process.cwd(),
    env: nextEnv
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
    const env = {
      ...options.env,
      TERM: options.env['TERM'] ?? 'xterm-256color'
    }
    const child = this.#processSpawner.spawn(command.file, command.args, env, options.cols, options.rows)
    child.resize(options.cols, options.rows)
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

    this.#sessions.set(id, {
      session,
      child,
      cols: options.cols,
      rows: options.rows
    })

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

  resizeSession(sessionId: string, cols: number, rows: number): void {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) {
      return
    }

    const record = this.#sessions.get(sessionId)
    if (!record) {
      return
    }

    if (record.cols === cols && record.rows === rows) {
      return
    }

    record.cols = cols
    record.rows = rows
    record.child.resize(cols, rows)
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
