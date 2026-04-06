export interface TerminalSize {
  cols: number
  rows: number
}

export function didTerminalBecomeActive(previousIsActive: boolean, nextIsActive: boolean): boolean {
  return !previousIsActive && nextIsActive
}

export function shouldApplyTerminalFocus(isActive: boolean, autoFocus: boolean): boolean {
  return isActive && autoFocus
}

export function shouldScheduleInitialOutputResync(isActive: boolean, hasSeenSessionOutput: boolean): boolean {
  return isActive && !hasSeenSessionOutput
}

export function shouldSendTerminalResize(
  isActive: boolean,
  nextSize: TerminalSize,
  previousSize: TerminalSize | null
): boolean {
  if (!isActive || nextSize.cols < 1 || nextSize.rows < 1) {
    return false
  }

  return previousSize?.cols !== nextSize.cols || previousSize.rows !== nextSize.rows
}
