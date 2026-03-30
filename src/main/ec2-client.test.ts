import test from 'node:test'
import assert from 'node:assert/strict'

import { listEc2Instances, mapDescribeInstancesOutput } from './ec2-client'

test('listEc2Instances builds EC2 client requests from direct credentials', async () => {
  const calls: unknown[] = []
  const instances = await listEc2Instances(
    {
      profile: {
        id: 'profile-1',
        name: 'dev-admin',
        region: 'ap-northeast-2',
        createdAt: '2026-03-30T00:00:00.000Z',
        updatedAt: '2026-03-30T00:00:00.000Z',
        hasSessionToken: false,
        isDefault: true
      },
      credentials: {
        accessKeyId: 'AKIADEVADMIN',
        secretAccessKey: 'super-secret'
      }
    },
    {
      createClient(config) {
        calls.push(config)
        return {
          send: async () => ({
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
          })
        }
      }
    }
  )

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], {
    region: 'ap-northeast-2',
    credentials: {
      accessKeyId: 'AKIADEVADMIN',
      secretAccessKey: 'super-secret',
      sessionToken: undefined
    }
  })
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

test('mapDescribeInstancesOutput flattens reservations and prefers Name tag', () => {
  const instances = mapDescribeInstancesOutput({
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
  })

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
