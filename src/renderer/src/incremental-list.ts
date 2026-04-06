import { useEffect, useState } from 'react'

interface IncrementalListStateOptions<T> {
  items: T[]
  pageSize: number
  visibleCount: number
  anchorIndices?: number[]
}

interface UseIncrementalListOptions<T> {
  items: T[]
  pageSize: number
  resetKey: string
  anchorIndices?: number[]
}

export interface IncrementalListState<T> {
  visibleItems: T[]
  visibleCount: number
  remainingCount: number
  hasMore: boolean
}

function resolveRequiredVisibleCount(
  totalCount: number,
  pageSize: number,
  requestedVisibleCount: number,
  anchorIndices: number[]
): number {
  const anchoredVisibleCount = anchorIndices.reduce((currentMax, anchorIndex) => {
    if (!Number.isInteger(anchorIndex) || anchorIndex < 0 || anchorIndex >= totalCount) {
      return currentMax
    }

    return Math.max(currentMax, anchorIndex + 1)
  }, 0)

  return Math.min(totalCount, Math.max(pageSize, requestedVisibleCount, anchoredVisibleCount))
}

export function getIncrementalListState<T>({
  items,
  pageSize,
  visibleCount,
  anchorIndices = []
}: IncrementalListStateOptions<T>): IncrementalListState<T> {
  const resolvedVisibleCount = resolveRequiredVisibleCount(items.length, pageSize, visibleCount, anchorIndices)

  return {
    visibleItems: items.slice(0, resolvedVisibleCount),
    visibleCount: resolvedVisibleCount,
    remainingCount: Math.max(0, items.length - resolvedVisibleCount),
    hasMore: resolvedVisibleCount < items.length
  }
}

export function useIncrementalList<T>({
  items,
  pageSize,
  resetKey,
  anchorIndices = []
}: UseIncrementalListOptions<T>): IncrementalListState<T> & { showMore: () => void } {
  const [visibleCount, setVisibleCount] = useState(pageSize)

  useEffect(() => {
    setVisibleCount(pageSize)
  }, [pageSize, resetKey])

  const state = getIncrementalListState({
    items,
    pageSize,
    visibleCount,
    anchorIndices
  })

  return {
    ...state,
    showMore: () => {
      setVisibleCount((currentVisibleCount) => Math.min(items.length, currentVisibleCount + pageSize))
    }
  }
}
