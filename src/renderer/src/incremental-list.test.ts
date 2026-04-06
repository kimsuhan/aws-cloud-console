import test from 'node:test'
import assert from 'node:assert/strict'

test('getIncrementalListState limits the initial render to the page size', async () => {
  const { getIncrementalListState } = await import('./incremental-list')

  const state = getIncrementalListState({
    items: Array.from({ length: 55 }, (_, index) => index),
    pageSize: 40,
    visibleCount: 40
  })

  assert.equal(state.visibleItems.length, 40)
  assert.equal(state.visibleCount, 40)
  assert.equal(state.remainingCount, 15)
  assert.equal(state.hasMore, true)
})

test('getIncrementalListState expands the visible range to keep anchored items rendered', async () => {
  const { getIncrementalListState } = await import('./incremental-list')

  const state = getIncrementalListState({
    items: Array.from({ length: 55 }, (_, index) => index),
    pageSize: 40,
    visibleCount: 40,
    anchorIndices: [42]
  })

  assert.equal(state.visibleItems.length, 43)
  assert.equal(state.visibleCount, 43)
  assert.equal(state.remainingCount, 12)
  assert.equal(state.hasMore, true)
})
