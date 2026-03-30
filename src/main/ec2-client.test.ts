import test from 'node:test'
import assert from 'node:assert/strict'

import { buildDescribeInstancesCommand, mapDescribeInstancesOutput } from './ec2-client'

test('buildDescribeInstancesCommand uses active profile and region', () => {
  const command = buildDescribeInstancesCommand({
    profileName: 'dev-admin',
    region: 'ap-northeast-2'
  })

  assert.deepEqual(command, [
    'aws',
    '--profile',
    'dev-admin',
    '--region',
    'ap-northeast-2',
    'ec2',
    'describe-instances',
    '--output',
    'json'
  ])
})

test('mapDescribeInstancesOutput flattens reservations and prefers Name tag', () => {
  const instances = mapDescribeInstancesOutput(JSON.stringify({
    Reservations: [
      {
        Instances: [
          {
            InstanceId: 'i-123',
            State: { Name: 'running' },
            PrivateIpAddress: '10.0.0.10',
            Placement: { AvailabilityZone: 'ap-northeast-2a' },
            Tags: [{ Key: 'Name', Value: 'api-server' }]
          }
        ]
      }
    ]
  }))

  assert.deepEqual(instances, [
    {
      id: 'i-123',
      name: 'api-server',
      state: 'running',
      privateIpAddress: '10.0.0.10',
      availabilityZone: 'ap-northeast-2a'
    }
  ])
})
