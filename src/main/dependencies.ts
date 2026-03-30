import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { spawn } from 'node:child_process'

export type DependencySource = 'configured' | 'well-known' | 'path' | 'missing'

export interface ResolvedDependency {
  installed: boolean
  resolvedPath: string | null
  source: DependencySource
  error: string | null
}

export interface DependencyStatus {
  awsCli: ResolvedDependency
  sessionManagerPlugin: ResolvedDependency
}

export interface RuntimePathSettings {
  awsCliPath: string | null
  sessionManagerPluginPath: string | null
}

interface DependencyProbe {
  fileExists(filePath: string): Promise<boolean>
  which(command: string): Promise<string | null>
  wellKnownPaths?: {
    awsCli: string[]
    sessionManagerPlugin: string[]
  }
}

const DEFAULT_WELL_KNOWN_PATHS = {
  awsCli: ['/opt/homebrew/bin/aws', '/usr/local/bin/aws', '/usr/bin/aws'],
  sessionManagerPlugin: [
    '/opt/homebrew/bin/session-manager-plugin',
    '/usr/local/bin/session-manager-plugin',
    '/usr/bin/session-manager-plugin'
  ]
}

async function defaultFileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.X_OK)
    return true
  } catch {
    return false
  }
}

async function defaultWhich(command: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn('which', [command])
    let output = ''

    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })

    child.once('error', () => resolve(null))
    child.once('close', (code) => {
      resolve(code === 0 ? output.trim() || null : null)
    })
  })
}

async function resolveDependency(
  configuredPath: string | null,
  command: string,
  label: string,
  probe: DependencyProbe
): Promise<ResolvedDependency> {
  if (configuredPath) {
    return (await probe.fileExists(configuredPath))
      ? {
          installed: true,
          resolvedPath: configuredPath,
          source: 'configured',
          error: null
        }
      : {
          installed: false,
          resolvedPath: null,
          source: 'missing',
          error: `Configured ${label} path was not found: ${configuredPath}`
        }
  }

  const wellKnownPaths =
    command === 'aws' ? probe.wellKnownPaths?.awsCli ?? [] : probe.wellKnownPaths?.sessionManagerPlugin ?? []
  for (const candidate of wellKnownPaths) {
    if (await probe.fileExists(candidate)) {
      return {
        installed: true,
        resolvedPath: candidate,
        source: 'well-known',
        error: null
      }
    }
  }

  const resolvedPath = await probe.which(command)
  if (resolvedPath) {
    return {
      installed: true,
      resolvedPath,
      source: 'path',
      error: null
    }
  }

  return {
    installed: false,
    resolvedPath: null,
    source: 'missing',
    error: `Unable to locate ${label}.`
  }
}

export async function detectDependencies(
  runtimePaths: RuntimePathSettings,
  probe: DependencyProbe = {
    fileExists: defaultFileExists,
    which: defaultWhich,
    wellKnownPaths: DEFAULT_WELL_KNOWN_PATHS
  }
): Promise<DependencyStatus> {
  const [awsCli, sessionManagerPlugin] = await Promise.all([
    resolveDependency(runtimePaths.awsCliPath, 'aws', 'aws CLI', {
      ...probe,
      wellKnownPaths: probe.wellKnownPaths ?? DEFAULT_WELL_KNOWN_PATHS
    }),
    resolveDependency(runtimePaths.sessionManagerPluginPath, 'session-manager-plugin', 'session-manager-plugin', {
      ...probe,
      wellKnownPaths: probe.wellKnownPaths ?? DEFAULT_WELL_KNOWN_PATHS
    })
  ])

  return {
    awsCli,
    sessionManagerPlugin
  }
}
