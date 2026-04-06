import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import type { S3BucketSummary, S3ObjectListResult } from '@shared/contracts'

const buckets: S3BucketSummary[] = [{ name: 'logs-bucket' }, { name: 'reports-bucket' }]

const listing: S3ObjectListResult = {
  bucketName: 'reports-bucket',
  prefix: 'reports/2026/',
  prefixes: [
    { prefix: 'reports/2026/april/', name: 'april' },
    { prefix: 'reports/2026/march/', name: 'march' }
  ],
  objects: [
    {
      key: 'reports/2026/april-summary.csv',
      name: 'april-summary.csv',
      kind: 'object',
      size: 512,
      lastModified: '2026-04-01T01:02:03.000Z',
      storageClass: 'STANDARD'
    }
  ],
  isTruncated: true,
  nextContinuationToken: 'token-1'
}

test('S3Workspace renders bucket navigation, breadcrumbs, mixed rows, and truncated guidance', async () => {
  const { S3Workspace } = await import('./s3-workspace')

  const markup = renderToStaticMarkup(
    <S3Workspace
      activeProfileName='prod-admin'
      activeRegion='ap-northeast-2'
      buckets={buckets}
      bucketsLoading={false}
      bucketsError={null}
      selectedBucketName='reports-bucket'
      currentPrefix='reports/2026/'
      searchQuery='april'
      objectList={listing}
      objectsLoading={false}
      objectsError={null}
      onRefreshBuckets={() => {}}
      onRefreshObjects={() => {}}
      onSearchQueryChange={() => {}}
      onSearchSubmit={() => {}}
      onSelectBucket={() => {}}
      onOpenPrefix={() => {}}
      onSelectBreadcrumb={() => {}}
    />
  )

  assert.match(markup, /S3 Browser/)
  assert.match(markup, /logs-bucket/)
  assert.match(markup, /reports-bucket/)
  assert.match(markup, /bucket-list-item active/)
  assert.match(markup, /reports-bucket/)
  assert.match(markup, /reports/)
  assert.match(markup, /2026/)
  assert.match(markup, /value="april"/)
  assert.match(markup, /placeholder="Search current path"/)
  assert.match(markup, /Folder/)
  assert.match(markup, /STANDARD/)
  assert.match(markup, /april-summary\.csv/)
  assert.match(markup, /Results may be incomplete/)
})

test('S3Workspace renders bucket and search empty states separately', async () => {
  const { S3Workspace } = await import('./s3-workspace')

  const noBucketsMarkup = renderToStaticMarkup(
    <S3Workspace
      activeProfileName='prod-admin'
      activeRegion='ap-northeast-2'
      buckets={[]}
      bucketsLoading={false}
      bucketsError={null}
      selectedBucketName={null}
      currentPrefix=''
      searchQuery=''
      objectList={null}
      objectsLoading={false}
      objectsError={null}
      onRefreshBuckets={() => {}}
      onRefreshObjects={() => {}}
      onSearchQueryChange={() => {}}
      onSearchSubmit={() => {}}
      onSelectBucket={() => {}}
      onOpenPrefix={() => {}}
      onSelectBreadcrumb={() => {}}
    />
  )

  assert.match(noBucketsMarkup, /No S3 buckets available/)

  const noResultsMarkup = renderToStaticMarkup(
    <S3Workspace
      activeProfileName='prod-admin'
      activeRegion='ap-northeast-2'
      buckets={buckets}
      bucketsLoading={false}
      bucketsError={null}
      selectedBucketName='reports-bucket'
      currentPrefix='reports/2026/'
      searchQuery='missing'
      objectList={{
        ...listing,
        prefixes: [],
        objects: [],
        isTruncated: false,
        nextContinuationToken: undefined
      }}
      objectsLoading={false}
      objectsError={null}
      onRefreshBuckets={() => {}}
      onRefreshObjects={() => {}}
      onSearchQueryChange={() => {}}
      onSearchSubmit={() => {}}
      onSelectBucket={() => {}}
      onOpenPrefix={() => {}}
      onSelectBreadcrumb={() => {}}
    />
  )

  assert.match(noResultsMarkup, /No matching objects found/)
})
