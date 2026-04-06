import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

async function renderRegionPickerWithMockedState(states: unknown[]): Promise<string> {
  const originalUseState = React.useState
  let callIndex = 0

  React.useState = ((initialState: unknown) => {
    const value = callIndex < states.length ? states[callIndex] : initialState
    callIndex += 1
    return [value, () => {}] as const
  }) as typeof React.useState

  try {
    const { RegionPicker } = await import('./RegionPicker')
    return renderToStaticMarkup(<RegionPicker value='ap-southeast-1' onChange={() => {}} />)
  } finally {
    React.useState = originalUseState
  }
}

test('RegionPicker keyboard state advances the active option and commits the current option', async () => {
  const { reduceRegionPickerKeyboardState } = await import('./RegionPicker')

  assert.deepEqual(
    reduceRegionPickerKeyboardState?.({ open: false, activeCode: 'ap-southeast-1' }, 'ArrowDown'),
    {
      open: true,
      activeCode: 'ap-southeast-2',
      committedCode: null
    }
  )

  assert.deepEqual(
    reduceRegionPickerKeyboardState?.({ open: true, activeCode: 'ap-southeast-2' }, 'Enter'),
    {
      open: false,
      activeCode: 'ap-southeast-2',
      committedCode: 'ap-southeast-2'
    }
  )
})

test('RegionPicker exposes an open combobox with an active descendant and selected option state', async () => {
  const markup = await renderRegionPickerWithMockedState([true, 'ap-southeast-2'])

  assert.match(markup, /role="combobox"/)
  assert.match(markup, /aria-haspopup="listbox"/)
  assert.match(markup, /aria-expanded="true"/)
  assert.match(markup, /aria-activedescendant="region-picker-option-ap-southeast-2"/)
  assert.match(markup, /aria-label="Default region"/)
  assert.match(markup, /id="region-picker-option-ap-southeast-2"/)
  assert.match(markup, /class="region-picker-option active"/)
  assert.match(markup, /aria-selected="true"/)
})
