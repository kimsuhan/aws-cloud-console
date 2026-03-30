import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface SessionTerminalProps {
  sessionId: string
  initialBuffer: string
}

export function SessionTerminal({ sessionId, initialBuffer }: SessionTerminalProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)

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
    const outputUnsubscribe = window.electronAPI.onSessionOutput((event) => {
      if (event.sessionId !== sessionId) {
        return
      }

      terminal.write(event.data)
    })

    terminal.open(host)
    if (initialBuffer) {
      terminal.write(initialBuffer)
    }

    const fitTerminal = () => {
      if (!terminalRef.current) {
        return
      }

      fitAddon.fit()
      void window.electronAPI.resizeSession({ sessionId, cols: terminal.cols, rows: terminal.rows })
    }

    const animationFrame = window.requestAnimationFrame(fitTerminal)

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(fitTerminal)
    })

    observer.observe(host)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      observer.disconnect()
      inputDisposable.dispose()
      outputUnsubscribe()
      terminal.dispose()
      terminalRef.current = null
    }
  }, [initialBuffer, sessionId])

  return <div className="terminal-host" ref={hostRef} />
}
