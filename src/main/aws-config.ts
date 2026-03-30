export function parseIniSections(content: string): Map<string, Map<string, string>> {
  const sections = new Map<string, Map<string, string>>()
  let currentSection: Map<string, string> | null = null

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()

    if (!line || line.startsWith('#') || line.startsWith(';')) {
      continue
    }

    if (line.startsWith('[') && line.endsWith(']')) {
      const sectionName = line.slice(1, -1).trim()
      currentSection = new Map<string, string>()
      sections.set(sectionName, currentSection)
      continue
    }

    if (!currentSection) {
      continue
    }

    const separatorIndex = line.indexOf('=')

    if (separatorIndex === -1) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).trim()
    currentSection.set(key, value)
  }

  return sections
}

export function listCredentialProfiles(content: string): string[] {
  return [...parseIniSections(content).keys()].sort((left, right) => left.localeCompare(right))
}

export function resolveProfileRegion(profileName: string, configContent: string): string | null {
  const sections = parseIniSections(configContent)
  const sectionName = profileName === 'default' ? 'default' : `profile ${profileName}`
  const region = sections.get(sectionName)?.get('region')

  return region ?? null
}
