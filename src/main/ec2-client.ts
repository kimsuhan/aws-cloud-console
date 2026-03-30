import { DescribeInstancesCommand, EC2Client, type DescribeInstancesCommandOutput, type EC2ClientConfig } from '@aws-sdk/client-ec2'

import type { Ec2InstanceSummary } from '../shared/contracts'
import type { ActiveProfileWithCredentials } from './profile-store'

interface Ec2ClientLike {
  send(command: DescribeInstancesCommand): Promise<DescribeInstancesCommandOutput>
}

interface Ec2ClientFactory {
  createClient(config: EC2ClientConfig): Ec2ClientLike
}

function createClientConfig(activeProfile: ActiveProfileWithCredentials): EC2ClientConfig {
  return {
    region: activeProfile.profile.region,
    credentials: {
      accessKeyId: activeProfile.credentials.accessKeyId,
      secretAccessKey: activeProfile.credentials.secretAccessKey,
      sessionToken: activeProfile.credentials.sessionToken
    }
  }
}

export function mapDescribeInstancesOutput(output: DescribeInstancesCommandOutput): Ec2InstanceSummary[] {
  return (output.Reservations ?? []).flatMap((reservation) =>
    (reservation.Instances ?? []).map((instance) => ({
      id: instance.InstanceId ?? 'unknown-instance',
      name: instance.Tags?.find((tag) => tag.Key === 'Name')?.Value ?? instance.InstanceId ?? 'Unnamed instance',
      state: instance.State?.Name ?? 'unknown',
      privateIpAddress: instance.PrivateIpAddress ?? null,
      availabilityZone: instance.Placement?.AvailabilityZone ?? null
    }))
  )
}

export async function listEc2Instances(
  activeProfile: ActiveProfileWithCredentials,
  factory: Ec2ClientFactory = {
    createClient(config) {
      return new EC2Client(config)
    }
  }
): Promise<Ec2InstanceSummary[]> {
  const client = factory.createClient(createClientConfig(activeProfile))
  const output = await client.send(new DescribeInstancesCommand({}))
  return mapDescribeInstancesOutput(output)
}
