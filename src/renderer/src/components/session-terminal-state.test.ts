import test from 'node:test'
import assert from 'node:assert/strict'

import {
  didTerminalBecomeActive,
  shouldApplyTerminalFocus,
  shouldScheduleInitialOutputResync,
  shouldSendTerminalResize
} from './session-terminal-state'

test('inactive terminals do not focus or schedule the initial output resync', () => {
  assert.equal(shouldApplyTerminalFocus(false, true), false)
  assert.equal(shouldScheduleInitialOutputResync(false, false), false)
})

test('terminal activation is detected only on false-to-true transitions', () => {
  assert.equal(didTerminalBecomeActive(false, true), true)
  assert.equal(didTerminalBecomeActive(true, true), false)
  assert.equal(didTerminalBecomeActive(true, false), false)
})

test('resize sync only runs for active terminals with a changed non-zero size', () => {
  assert.equal(shouldSendTerminalResize(false, { cols: 120, rows: 40 }, null), false)
  assert.equal(shouldSendTerminalResize(true, { cols: 0, rows: 40 }, null), false)
  assert.equal(shouldSendTerminalResize(true, { cols: 120, rows: 40 }, null), true)
  assert.equal(shouldSendTerminalResize(true, { cols: 120, rows: 40 }, { cols: 120, rows: 40 }), false)
  assert.equal(shouldSendTerminalResize(true, { cols: 132, rows: 40 }, { cols: 120, rows: 40 }), true)
})
