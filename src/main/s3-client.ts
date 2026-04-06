import {
  ListBucketsCommand,
  ListObjectsV2Command,
  S3Client,
  type ListBucketsCommandOutput,
  type ListObjectsV2CommandOutput,
  type S3ClientConfig
} from '@aws-sdk/client-s3'

import type {
  ListS3ObjectsRequest,
  S3BucketSummary,
  S3ObjectListResult,
  S3ObjectSummary,
  S3PrefixSummary
} from '../shared/contracts'
import type { ActiveProfileWithCredentials } from './profile-store'

interface S3ClientLike {
  send(command: ListBucketsCommand | ListObjectsV2Command): Promise<ListBucketsCommandOutput | ListObjectsV2CommandOutput>
}

interface S3ClientFactory {
  createClient(config: S3ClientConfig): S3ClientLike
}

function createClientConfig(activeProfile: ActiveProfileWithCredentials): S3ClientConfig {
  return {
    region: activeProfile.profile.region,
    credentials: {
      accessKeyId: activeProfile.credentials.accessKeyId,
      secretAccessKey: activeProfile.credentials.secretAccessKey,
      sessionToken: activeProfile.credentials.sessionToken
    }
  }
}

function normalizeS3BrowsePath(input: string): string {
  return input
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .join('/')
}

function buildEffectivePrefix(prefix: string, query: string): string {
  const normalizedPrefix = normalizeS3BrowsePath(prefix)
  const normalizedQuery = normalizeS3BrowsePath(query)
  return [normalizedPrefix, normalizedQuery].filter(Boolean).join('/')
}

function getLeafName(key: string): string {
  const trimmed = key.endsWith('/') ? key.slice(0, -1) : key
  const segments = trimmed.split('/').filter(Boolean)
  return segments.at(-1) ?? trimmed
}

export function mapListBucketsOutput(output: ListBucketsCommandOutput): S3BucketSummary[] {
  return (output.Buckets ?? [])
    .map((bucket) => bucket.Name?.trim())
    .filter((name): name is string => Boolean(name))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => ({ name }))
}

export function mapListObjectsOutput(
  bucketName: string,
  effectivePrefix: string,
  output: ListObjectsV2CommandOutput
): S3ObjectListResult {
  const placeholderKey = effectivePrefix ? `${effectivePrefix}/` : effectivePrefix

  const prefixes: S3PrefixSummary[] = (output.CommonPrefixes ?? [])
    .map((entry) => entry.Prefix ?? '')
    .filter(Boolean)
    .map((prefix) => ({
      prefix,
      name: getLeafName(prefix)
    }))
    .sort((left, right) => left.name.localeCompare(right.name))

  const objects: S3ObjectSummary[] = (output.Contents ?? [])
    .map((entry) => {
      const key = entry.Key ?? ''
      if (!key || key === effectivePrefix || key === placeholderKey) {
        return null
      }

      return {
        key,
        name: getLeafName(key),
        kind: 'object' as const,
        size: entry.Size ?? 0,
        lastModified: entry.LastModified?.toISOString() ?? null,
        storageClass: entry.StorageClass ?? null
      }
    })
    .filter((entry): entry is S3ObjectSummary => entry !== null)
    .sort((left, right) => left.name.localeCompare(right.name))

  return {
    bucketName,
    prefix: effectivePrefix,
    prefixes,
    objects,
    isTruncated: output.IsTruncated ?? false,
    nextContinuationToken: output.NextContinuationToken
  }
}

export async function listS3Buckets(
  activeProfile: ActiveProfileWithCredentials,
  factory: S3ClientFactory = {
    createClient(config) {
      return new S3Client(config)
    }
  }
): Promise<S3BucketSummary[]> {
  const client = factory.createClient(createClientConfig(activeProfile))
  const output = (await client.send(new ListBucketsCommand({}))) as ListBucketsCommandOutput
  return mapListBucketsOutput(output)
}

export async function listS3Objects(
  activeProfile: ActiveProfileWithCredentials,
  request: Omit<ListS3ObjectsRequest, 'profileId'>,
  factory: S3ClientFactory = {
    createClient(config) {
      return new S3Client(config)
    }
  }
): Promise<S3ObjectListResult> {
  const client = factory.createClient(createClientConfig(activeProfile))
  const effectivePrefix = buildEffectivePrefix(request.prefix, request.query)
  const prefixParameter = effectivePrefix ? `${effectivePrefix}${effectivePrefix.endsWith('/') ? '' : ''}` : undefined
  const output = (await client.send(
    new ListObjectsV2Command({
      Bucket: request.bucketName,
      Prefix: prefixParameter || undefined,
      Delimiter: '/'
    })
  )) as ListObjectsV2CommandOutput

  return mapListObjectsOutput(request.bucketName, effectivePrefix, output)
}
