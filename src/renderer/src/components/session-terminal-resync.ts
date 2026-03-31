export interface TimeoutScheduler {
  setTimeout(callback: () => void, delay: number): number
  clearTimeout(id: number): void
}

const RESYNC_DELAYS_MS = [0, 75, 250]

export function scheduleTerminalResync(scheduler: TimeoutScheduler, callback: () => void): () => void {
  const timeoutIds = RESYNC_DELAYS_MS.map((delay) => scheduler.setTimeout(callback, delay))

  return () => {
    timeoutIds.forEach((id) => scheduler.clearTimeout(id))
  }
}
