import { useEffect, useId, useMemo, useRef, useState } from 'react'

import { findRegionOption, regionGroups } from '@renderer/region-catalog'

interface RegionPickerProps {
  value: string
  onChange: (region: string) => void
  ariaLabel?: string
}

interface RegionPickerKeyboardState {
  open: boolean
  activeCode: string
}

interface RegionPickerKeyboardResult {
  open: boolean
  activeCode: string
  committedCode: string | null
}

const handledRegionPickerKeys = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Spacebar', 'Escape'])

const regionPickerOptions = regionGroups.flatMap((group) =>
  group.options.map((option) => ({
    ...option,
    group: group.label
  }))
)

function getRegionPickerOptionIndex(code: string, direction: 1 | -1): number {
  const index = regionPickerOptions.findIndex((option) => option.code === code)
  if (index >= 0) {
    return index
  }

  return direction > 0 ? -1 : 0
}

function getRegionPickerOptionCode(index: number): string {
  const optionCount = regionPickerOptions.length
  const normalizedIndex = ((index % optionCount) + optionCount) % optionCount
  return regionPickerOptions[normalizedIndex]?.code ?? ''
}

export function reduceRegionPickerKeyboardState(
  state: RegionPickerKeyboardState,
  key: string
): RegionPickerKeyboardResult {
  if (key === 'Escape') {
    return {
      open: false,
      activeCode: state.activeCode,
      committedCode: null
    }
  }

  if (key === 'ArrowDown') {
    return {
      open: true,
      activeCode: getRegionPickerOptionCode(getRegionPickerOptionIndex(state.activeCode, 1) + 1),
      committedCode: null
    }
  }

  if (key === 'ArrowUp') {
    return {
      open: true,
      activeCode: getRegionPickerOptionCode(getRegionPickerOptionIndex(state.activeCode, -1) - 1),
      committedCode: null
    }
  }

  if (key === 'Home') {
    return {
      open: true,
      activeCode: getRegionPickerOptionCode(0),
      committedCode: null
    }
  }

  if (key === 'End') {
    return {
      open: true,
      activeCode: getRegionPickerOptionCode(regionPickerOptions.length - 1),
      committedCode: null
    }
  }

  if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
    if (!state.open) {
      return {
        open: true,
        activeCode: state.activeCode,
        committedCode: null
      }
    }

    return {
      open: false,
      activeCode: state.activeCode,
      committedCode: state.activeCode
    }
  }

  return {
    open: state.open,
    activeCode: state.activeCode,
    committedCode: null
  }
}

export function RegionPicker({ value, onChange, ariaLabel = 'Default region' }: RegionPickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const selected = useMemo(() => findRegionOption(value), [value])
  const selectedCode = selected?.code ?? value
  const [activeCode, setActiveCode] = useState(selectedCode)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const panelId = useId()
  const activeOptionId = `region-picker-option-${activeCode}`

  useEffect(() => {
    setActiveCode(selectedCode)
  }, [selectedCode])

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
        aria-controls={panelId}
        aria-activedescendant={open ? activeOptionId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={open ? 'region-picker-trigger active' : 'region-picker-trigger'}
        onClick={() => {
          if (!open) {
            setActiveCode(selectedCode)
          }

          setOpen((current) => !current)
        }}
        onKeyDown={(event) => {
          if (!handledRegionPickerKeys.has(event.key)) {
            return
          }

          const nextState = reduceRegionPickerKeyboardState({ open, activeCode }, event.key)
          event.preventDefault()
          setOpen(nextState.open)
          setActiveCode(nextState.activeCode)
          if (nextState.committedCode) {
            onChange(nextState.committedCode)
          }
        }}
        role="combobox"
        type="button"
      >
        <div className="region-picker-copy">
          <strong>{selected?.city ?? value}</strong>
          <span>{selected?.code ?? value}</span>
        </div>
      </button>

      {open ? (
        <div className="region-picker-panel" id={panelId} role="listbox">
          {regionGroups.map((group) => (
            <div key={group.label} className="region-picker-group">
              <div className="region-picker-group-label">{group.label}</div>
              {group.options.map((option) => (
                <button
                  aria-selected={option.code === selectedCode}
                  id={`region-picker-option-${option.code}`}
                  key={option.code}
                  className={option.code === activeCode ? 'region-picker-option active' : 'region-picker-option'}
                  onClick={() => {
                    setActiveCode(option.code)
                    onChange(option.code)
                    setOpen(false)
                  }}
                  role="option"
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
