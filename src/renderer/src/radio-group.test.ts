import test from 'node:test'
import assert from 'node:assert/strict'

test('getNextRadioGroupValue moves selection with arrow keys and wraps around the group', async () => {
  const { getNextRadioGroupValue } = await import('./radio-group')

  assert.equal(
    getNextRadioGroupValue({
      key: 'ArrowRight',
      options: ['system', 'light', 'dark'],
      value: 'system'
    }),
    'light'
  )

  assert.equal(
    getNextRadioGroupValue({
      key: 'ArrowLeft',
      options: ['system', 'light', 'dark'],
      value: 'system'
    }),
    'dark'
  )

  assert.equal(
    getNextRadioGroupValue({
      key: 'ArrowDown',
      options: ['system', 'light', 'dark'],
      value: 'dark'
    }),
    'system'
  )

  assert.equal(
    getNextRadioGroupValue({
      key: 'ArrowUp',
      options: ['system', 'light', 'dark'],
      value: 'light'
    }),
    'system'
  )
})

test('getNextRadioGroupValue handles Home, End, and unsupported keys', async () => {
  const { getNextRadioGroupValue } = await import('./radio-group')

  assert.equal(
    getNextRadioGroupValue({
      key: 'Home',
      options: ['all', 'favorites', 'presets', 'recent'],
      value: 'recent'
    }),
    'all'
  )

  assert.equal(
    getNextRadioGroupValue({
      key: 'End',
      options: ['all', 'favorites', 'presets', 'recent'],
      value: 'all'
    }),
    'recent'
  )

  assert.equal(
    getNextRadioGroupValue({
      key: 'Tab',
      options: ['all', 'favorites', 'presets', 'recent'],
      value: 'all'
    }),
    null
  )
})

test('getRadioGroupTabIndex keeps only the selected radio tabbable and falls back to the first option', async () => {
  const { getRadioGroupTabIndex } = await import('./radio-group')

  assert.equal(getRadioGroupTabIndex({ optionIndex: 0, optionValue: 'system', value: 'light' }), -1)
  assert.equal(getRadioGroupTabIndex({ optionIndex: 1, optionValue: 'light', value: 'light' }), 0)
  assert.equal(getRadioGroupTabIndex({ optionIndex: 0, optionValue: 'db', value: null }), 0)
  assert.equal(getRadioGroupTabIndex({ optionIndex: 1, optionValue: 'redis', value: null }), -1)
})
