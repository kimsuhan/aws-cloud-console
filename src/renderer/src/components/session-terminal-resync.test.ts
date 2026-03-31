import test from 'node:test'
import assert from 'node:assert/strict'

import { scheduleTerminalResync } from './session-terminal-resync'

test('scheduleTerminalResync runs an immediate and delayed resize sequence', () => {
  const scheduled: Array<{ delay: number; cleared: boolean }> = []
  const executed: number[] = []

  const cancel = scheduleTerminalResync(
    {
      setTimeout(callback, delay) {
        scheduled.push({ delay, cleared: false })
        callback()
        return scheduled.length - 1
      },
      clearTimeout(id) {
        scheduled[id]!.cleared = true
      }
    },
    () => {
      executed.push(executed.length)
    }
  )

  assert.deepEqual(
    scheduled.map((entry) => entry.delay),
    [0, 75, 250]
  )
  assert.equal(executed.length, 3)

  cancel()

  assert.deepEqual(
    scheduled.map((entry) => entry.cleared),
    [true, true, true]
  )
})
