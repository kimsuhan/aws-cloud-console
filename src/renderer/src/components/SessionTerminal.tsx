import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

import { scheduleTerminalResync } from './session-terminal-resync'

interface SessionTerminalProps {
  sessionId: string
  initialBuffer: string
  autoFocus?: boolean
}

export function SessionTerminal({
  sessionId,
  initialBuffer,
  autoFocus = true
}: SessionTerminalProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null)
  const resizeFrameRef = useRef<number | null>(null)
  const resyncCancelRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const host = hostRef.current

    if (!host) {
      return
    }

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: '"SFMono-Regular", "SF Mono", Consolas, monospace',
      fontSize: 13,
      theme: {
        background: '#09111f',
        foreground: '#e5eefc'
      }
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
      if (terminal.cols < 1 || terminal.rows < 1) {
        return
      }

      const lastSize = lastSizeRef.current
      if (lastSize?.cols === terminal.cols && lastSize.rows === terminal.rows) {
        return
      }

      lastSizeRef.current = {
        cols: terminal.cols,
        rows: terminal.rows
      }
      void window.electronAPI.resizeSession({ sessionId, cols: terminal.cols, rows: terminal.rows })
    }
    const outputUnsubscribe = window.electronAPI.onSessionOutput((event) => {
      if (event.sessionId !== sessionId) {
        return
      }

      terminal.write(event.data)
      if (!hasSeenSessionOutput) {
        hasSeenSessionOutput = true
        resyncCancelRef.current?.()
        resyncCancelRef.current = scheduleTerminalResync(window, runResizeSync)
      }
    })

    terminal.open(host)
    if (initialBuffer) {
      terminal.write(initialBuffer)
    }
    if (autoFocus) {
      terminal.focus()
    }

    resizeFrameRef.current = window.requestAnimationFrame(runResizeSync)

    const observer = new ResizeObserver(() => {
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current)
      }
      resizeFrameRef.current = window.requestAnimationFrame(runResizeSync)
    })

    observer.observe(host)
    const handlePointerDown = () => {
      terminal.focus()
      resyncCancelRef.current?.()
      resyncCancelRef.current = scheduleTerminalResync(window, runResizeSync)
    }
    host.addEventListener('pointerdown', handlePointerDown)

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        return
      }

      resyncCancelRef.current?.()
      resyncCancelRef.current = scheduleTerminalResync(window, runResizeSync)
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current)
      }
      resyncCancelRef.current?.()
      observer.disconnect()
      host.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      inputDisposable.dispose()
      outputUnsubscribe()
      terminal.dispose()
      terminalRef.current = null
      lastSizeRef.current = null
      resizeFrameRef.current = null
      resyncCancelRef.current = null
    }
  }, [initialBuffer, sessionId])

  return <div className="terminal-host" ref={hostRef} />
}
