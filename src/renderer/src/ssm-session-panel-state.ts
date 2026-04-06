import type { SessionTabState } from '@shared/contracts'

export interface SsmSessionPanelState {
  session: SessionTabState
  isActive: boolean
}

export function buildSsmSessionPanelStates(
  sessionTabs: SessionTabState[],
  activeTabId: string | null
): SsmSessionPanelState[] {
  return sessionTabs.map((session) => ({
    session,
    isActive: session.id === activeTabId
  }))
}
