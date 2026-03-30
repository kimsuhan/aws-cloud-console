import { spawn } from 'node:child_process'

import type { DependencyStatus } from '../shared/contracts'

interface CommandProbe {
  hasCommand(command: string): Promise<boolean>
}

async function defaultHasCommand(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, ['--version'])

    child.once('error', () => resolve(false))
    child.once('close', () => resolve(true))
  })
}

export async function detectDependencies(probe: CommandProbe = { hasCommand: defaultHasCommand }): Promise<DependencyStatus> {
  const [awsCliInstalled, sessionManagerPluginInstalled] = await Promise.all([
    probe.hasCommand('aws'),
    probe.hasCommand('session-manager-plugin')
  ])

  return {
    awsCliInstalled,
    sessionManagerPluginInstalled
  }
}
