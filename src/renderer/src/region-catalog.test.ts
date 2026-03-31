import test from 'node:test'
import assert from 'node:assert/strict'

import { findRegionOption, regionGroups } from './region-catalog'

test('regionGroups exposes the screenshot-based grouped region list in English', () => {
  assert.deepEqual(
    regionGroups.map((group) => group.label),
    ['United States', 'Asia Pacific', 'Canada', 'Europe', 'South America']
  )

  assert.deepEqual(regionGroups[0]?.options[0], {
    city: 'N. Virginia',
    code: 'us-east-1'
  })
  assert.deepEqual(regionGroups[1]?.options.find((option) => option.code === 'ap-northeast-2'), {
    city: 'Seoul',
    code: 'ap-northeast-2'
  })
  assert.deepEqual(regionGroups[4]?.options[0], {
    city: 'Sao Paulo',
    code: 'sa-east-1'
  })
})

test('findRegionOption resolves known codes and returns null for unknown codes', () => {
  assert.deepEqual(findRegionOption('eu-west-2'), {
    group: 'Europe',
    city: 'London',
    code: 'eu-west-2'
  })

  assert.equal(findRegionOption('ap-southeast-99'), null)
})
