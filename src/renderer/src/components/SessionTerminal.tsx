import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

import type { AppTheme, AppUiScale } from '@shared/contracts'

import { scheduleTerminalResync } from './session-terminal-resync'
import {
  didTerminalBecomeActive,
  shouldApplyTerminalFocus,
  shouldScheduleInitialOutputResync,
  shouldSendTerminalResize
} from './session-terminal-state'

interface SessionTerminalProps {
  sessionId: string
  isActive: boolean
  autoFocus?: boolean
  theme: AppTheme
  uiScale: AppUiScale
}

function uiScaleFactor(uiScale: AppUiScale): number {
  switch (uiScale) {
    case '90':
      return 0.9
    case '110':
      return 1.1
    case '120':
      return 1.2
    case 'system':
    case '100':
    default:
      return 1
  }
}

function resolveTerminalTheme(): { background: string; foreground: string } {
  const styles = getComputedStyle(document.documentElement)
  return {
    background: styles.getPropertyValue('--console-surface').trim() || '#0a0f14',
    foreground: styles.getPropertyValue('--console-surface-foreground').trim() || '#d7dee7'
  }
}

export function SessionTerminal({
  sessionId,
  isActive,
  autoFocus = true,
  theme,
  uiScale
}: SessionTerminalProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null)
  const resyncCancelRef = useRef<(() => void) | null>(null)
  const resizeSyncRef = useRef<(() => void) | null>(null)
  const isActiveRef = useRef(isActive)
  const previousActiveRef = useRef(isActive)

  useEffect(() => {
    isActiveRef.current = isActive
  }, [isActive])

  useEffect(() => {
    const host = hostRef.current

    if (!host) {
      return
    }

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: '"SFMono-Regular", "SF Mono", Consolas, monospace',
      fontSize: Math.round(13 * uiScaleFactor(uiScale)),
      theme: resolveTerminalTheme()
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminalRef.current = terminal

    const inputDisposable = terminal.onData((data) => {
      void window.electronAPI.sendSessionInput(sessionId, data)
    })
    let hasSeenSessionOutput = false
    const runResizeSync = () => {
      if (!terminalRef.current) {
        return
      }

      fitAddon.fit()
      const nextSize = {
        cols: terminal.cols,
        rows: terminal.rows
      }

      if (!shouldSendTerminalResize(isActiveRef.current, nextSize, lastSizeRef.current)) {
        return
      }

      lastSizeRef.current = nextSize
      void window.electronAPI.resizeSession({ sessionId, cols: nextSize.cols, rows: nextSize.rows })
    }
    resizeSyncRef.current = runResizeSync
    const outputUnsubscribe = window.electronAPI.onSessionOutput((event) => {
      if (event.sessionId !== sessionId) {
        return
      }

      terminal.write(event.data)
      if (shouldScheduleInitialOutputResync(isActiveRef.current, hasSeenSessionOutput)) {
        hasSeenSessionOutput = true
        resyncCancelRef.current?.()
        resyncCancelRef.current = scheduleTerminalResync(window, runResizeSync)
        return
      }

      hasSeenSessionOutput = true
    })

    terminal.open(host)

    const observer = new ResizeObserver(() => {
      if (!isActiveRef.current) {
        return
      }

      resyncCancelRef.current?.()
      resyncCancelRef.current = scheduleTerminalResync(window, runResizeSync)
    })

    observer.observe(host)
    const handlePointerDown = () => {
      terminal.focus()
      if (!isActiveRef.current) {
        return
      }

      resyncCancelRef.current?.()
      resyncCancelRef.current = scheduleTerminalResync(window, runResizeSync)
    }
    host.addEventListener('pointerdown', handlePointerDown)

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || !isActiveRef.current) {
        return
      }

      resyncCancelRef.current?.()
      resyncCancelRef.current = scheduleTerminalResync(window, runResizeSync)
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      resyncCancelRef.current?.()
      observer.disconnect()
      host.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      inputDisposable.dispose()
      outputUnsubscribe()
      terminal.dispose()
      terminalRef.current = null
      lastSizeRef.current = null
      resyncCancelRef.current = null
      resizeSyncRef.current = null
    }
  }, [sessionId])

  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) {
      return
    }

    terminal.options.fontSize = Math.round(13 * uiScaleFactor(uiScale))
    terminal.options.theme = resolveTerminalTheme()
    if (isActive) {
      resizeSyncRef.current?.()
    }
  }, [isActive, theme, uiScale])

  useEffect(() => {
    const nextIsActive = isActive
    const previousIsActive = previousActiveRef.current
    previousActiveRef.current = nextIsActive

    if (!nextIsActive) {
      return
    }

    if (shouldApplyTerminalFocus(nextIsActive, autoFocus)) {
      terminalRef.current?.focus()
    }

    if (didTerminalBecomeActive(previousIsActive, nextIsActive) || previousIsActive === nextIsActive) {
      resyncCancelRef.current?.()
      if (resizeSyncRef.current) {
        resyncCancelRef.current = scheduleTerminalResync(window, resizeSyncRef.current)
      }
    }
  }, [autoFocus, isActive])

  return <div className="terminal-host" ref={hostRef} />
}
