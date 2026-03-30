import test from 'node:test'
import assert from 'node:assert/strict'

import { listCredentialProfiles, resolveProfileRegion } from './aws-config'

test('listCredentialProfiles returns all profiles from credentials content', () => {
  const profiles = listCredentialProfiles(`
[default]
aws_access_key_id = root

[dev-admin]
aws_access_key_id = abc

[prod]
aws_access_key_id = def
`)

  assert.deepEqual(profiles, ['default', 'dev-admin', 'prod'])
})

test('resolveProfileRegion reads region from shared config profile section', () => {
  const region = resolveProfileRegion(
    'dev-admin',
    `
[profile dev-admin]
region = ap-northeast-2
output = json
`
  )

  assert.equal(region, 'ap-northeast-2')
})

test('resolveProfileRegion accepts default profile region', () => {
  const region = resolveProfileRegion(
    'default',
    `
[default]
region = us-west-2
`
  )

  assert.equal(region, 'us-west-2')
})
