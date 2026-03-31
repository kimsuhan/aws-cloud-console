import { useEffect, useMemo, useRef, useState } from 'react'

import { findRegionOption, regionGroups } from '@renderer/region-catalog'

interface RegionPickerProps {
  value: string
  onChange: (region: string) => void
}

export function RegionPicker({ value, onChange }: RegionPickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const selected = useMemo(() => findRegionOption(value), [value])

  useEffect(() => {
    if (!open) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className="region-picker" ref={containerRef}>
      <button
        className={open ? 'region-picker-trigger active' : 'region-picker-trigger'}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setOpen((current) => !current)
          }
        }}
        type="button"
      >
        <div className="region-picker-copy">
          <strong>{selected?.city ?? value}</strong>
          <span>{selected?.code ?? value}</span>
        </div>
      </button>

      {open ? (
        <div className="region-picker-panel">
          {regionGroups.map((group) => (
            <div key={group.label} className="region-picker-group">
              <div className="region-picker-group-label">{group.label}</div>
              {group.options.map((option) => (
                <button
                  key={option.code}
                  className={option.code === value ? 'region-picker-option active' : 'region-picker-option'}
                  onClick={() => {
                    onChange(option.code)
                    setOpen(false)
                  }}
                  type="button"
                >
                  <span>{option.city}</span>
                  <strong>{option.code}</strong>
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
