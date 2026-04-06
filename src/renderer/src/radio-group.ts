import { useRef } from 'react'

const previousRadioGroupKeys = new Set(['ArrowLeft', 'ArrowUp'])
const nextRadioGroupKeys = new Set(['ArrowRight', 'ArrowDown'])

export function getNextRadioGroupValue<T extends string>({
  key,
  options,
  value,
  focusedValue
}: {
  key: string
  options: readonly T[]
  value: T | null | undefined
  focusedValue?: T
}): T | null {
  if (options.length === 0) {
    return null
  }

  if (key === 'Home') {
    return options[0] ?? null
  }

  if (key === 'End') {
    return options[options.length - 1] ?? null
  }

  if (!previousRadioGroupKeys.has(key) && !nextRadioGroupKeys.has(key)) {
    return null
  }

  const activeValue = value ?? focusedValue ?? options[0]
  const currentIndex = Math.max(options.indexOf(activeValue), 0)
  const nextIndex = nextRadioGroupKeys.has(key)
    ? (currentIndex + 1) % options.length
    : (currentIndex - 1 + options.length) % options.length

  return options[nextIndex] ?? null
}

export function getRadioGroupTabIndex<T extends string>({
  optionIndex,
  optionValue,
  value
}: {
  optionIndex: number
  optionValue: T
  value: T | null | undefined
}): number {
  if (value == null) {
    return optionIndex === 0 ? 0 : -1
  }

  return optionValue === value ? 0 : -1
}

export function useRadioGroupNavigation<T extends string>({
  options,
  value,
  onChange
}: {
  options: readonly T[]
  value: T | null | undefined
  onChange: (nextValue: T) => void
}): {
  getRadioProps: (optionValue: T, optionIndex: number) => {
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void
    ref: (node: HTMLButtonElement | null) => void
    tabIndex: number
  }
} {
  const buttonRefs = useRef(new Map<T, HTMLButtonElement>())

  const focusValue = (nextValue: T) => {
    if (typeof window === 'undefined') {
      return
    }

    window.requestAnimationFrame(() => {
      buttonRefs.current.get(nextValue)?.focus()
    })
  }

  return {
    getRadioProps: (optionValue, optionIndex) => ({
      onKeyDown: (event) => {
        const nextValue = getNextRadioGroupValue({
          key: event.key,
          options,
          value,
          focusedValue: optionValue
        })

        if (!nextValue) {
          return
        }

        event.preventDefault()
        onChange(nextValue)
        focusValue(nextValue)
      },
      ref: (node) => {
        if (node) {
          buttonRefs.current.set(optionValue, node)
          return
        }

        buttonRefs.current.delete(optionValue)
      },
      tabIndex: getRadioGroupTabIndex({ optionIndex, optionValue, value })
    })
  }
}
