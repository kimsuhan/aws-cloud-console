import { spawn } from 'node:child_process'

import type { ActiveProfileState, Ec2InstanceSummary } from '../shared/contracts'

export function buildDescribeInstancesCommand(activeProfile: ActiveProfileState): string[] {
  return [
    'aws',
    '--profile',
    activeProfile.profileName,
    '--region',
    activeProfile.region,
    'ec2',
    'describe-instances',
    '--output',
    'json'
  ]
}

export function mapDescribeInstancesOutput(stdout: string): Ec2InstanceSummary[] {
  const parsed = JSON.parse(stdout) as {
    Reservations?: Array<{
      Instances?: Array<{
        InstanceId?: string
        State?: { Name?: string }
        PrivateIpAddress?: string
        Placement?: { AvailabilityZone?: string }
        Tags?: Array<{ Key?: string; Value?: string }>
      }>
    }>
  }

  return (parsed.Reservations ?? []).flatMap((reservation) =>
    (reservation.Instances ?? []).map((instance) => ({
      id: instance.InstanceId ?? 'unknown-instance',
      name: instance.Tags?.find((tag) => tag.Key === 'Name')?.Value ?? instance.InstanceId ?? 'Unnamed instance',
      state: instance.State?.Name ?? 'unknown',
      privateIpAddress: instance.PrivateIpAddress ?? null,
      availabilityZone: instance.Placement?.AvailabilityZone ?? null
    }))
  )
}

export async function listEc2Instances(activeProfile: ActiveProfileState): Promise<Ec2InstanceSummary[]> {
  const command = buildDescribeInstancesCommand(activeProfile)

  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn(command[0], command.slice(1))
    let output = ''
    let errorOutput = ''

    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      errorOutput += chunk.toString()
    })

    child.once('error', reject)
    child.once('close', (code) => {
      if (code === 0) {
        resolve(output)
        return
      }

      reject(new Error(errorOutput.trim() || `EC2 query failed with exit code ${code ?? 'unknown'}`))
    })
  })

  return mapDescribeInstancesOutput(stdout)
}
