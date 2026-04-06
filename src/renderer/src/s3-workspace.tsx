import type { S3BucketSummary, S3ObjectListResult } from '@shared/contracts'

import { EmptyStatePanel } from './components/EmptyStatePanel'
import { LoadingStatePanel } from './components/LoadingStatePanel'
import { WorkspaceHeader } from './components/WorkspaceHeader'
import { WorkspaceStatusBadge } from './components/WorkspaceStatusBadge'
import { useI18n } from './i18n'

interface S3WorkspaceProps {
  activeProfileName: string
  activeRegion: string
  buckets: S3BucketSummary[]
  bucketsLoading: boolean
  bucketsError: string | null
  selectedBucketName: string | null
  currentPrefix: string
  searchQuery: string
  objectList: S3ObjectListResult | null
  objectsLoading: boolean
  objectsError: string | null
  onRefreshBuckets: () => void
  onRefreshObjects: () => void
  onSearchQueryChange: (value: string) => void
  onSearchSubmit: () => void
  onSelectBucket: (bucketName: string) => void
  onOpenPrefix: (prefix: string) => void
  onSelectBreadcrumb: (prefix: string) => void
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`
  }
  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function buildBreadcrumbs(bucketName: string, currentPrefix: string): Array<{ label: string; prefix: string }> {
  const segments = currentPrefix.split('/').filter(Boolean)
  const crumbs = [{ label: bucketName, prefix: '' }]

  let nextPrefix = ''
  segments.forEach((segment) => {
    nextPrefix = `${nextPrefix}${segment}/`
    crumbs.push({ label: segment, prefix: nextPrefix })
  })

  return crumbs
}

export function S3Workspace({
  activeProfileName,
  activeRegion,
  buckets,
  bucketsLoading,
  bucketsError,
  selectedBucketName,
  currentPrefix,
  searchQuery,
  objectList,
  objectsLoading,
  objectsError,
  onRefreshBuckets,
  onRefreshObjects,
  onSearchQueryChange,
  onSearchSubmit,
  onSelectBucket,
  onOpenPrefix,
  onSelectBreadcrumb
}: S3WorkspaceProps): React.JSX.Element {
  const { t } = useI18n()
  const hasBuckets = buckets.length > 0
  const breadcrumbs = selectedBucketName ? buildBreadcrumbs(selectedBucketName, currentPrefix) : []
  const visibleItemCount = (objectList?.prefixes.length ?? 0) + (objectList?.objects.length ?? 0)

  return (
    <div className="workspace-screen s3-workspace-screen">
      <WorkspaceHeader
        eyebrow={t('s3.title')}
        title={t('s3.title')}
        copy={t('s3.copy')}
        context={
          <>
            <span className="workspace-badge">{activeProfileName}</span>
            <span className="workspace-badge">{activeRegion}</span>
            <span className="workspace-badge accent">{t('s3.results', { count: visibleItemCount })}</span>
            <WorkspaceStatusBadge
              label={bucketsLoading || objectsLoading ? t('s3.loadingObjects') : t('s3.bucketListReady')}
              tone={bucketsLoading || objectsLoading ? 'loading' : 'ready'}
            />
          </>
        }
        actions={
          <div className="s3-toolbar-actions">
            <button className="toolbar-button" onClick={onRefreshBuckets} type="button">
              {t('common.refresh')}
            </button>
            {selectedBucketName ? (
              <button className="toolbar-button" onClick={onRefreshObjects} type="button">
                {t('common.refresh')}
              </button>
            ) : null}
          </div>
        }
      />

      {bucketsError ? (
        <div className="callout callout-error inline-callout">
          <strong>{t('s3.bucketLookupFailed')}</strong>
          <p>{bucketsError}</p>
        </div>
      ) : null}

      <div className="s3-browser-layout">
        <aside className="s3-bucket-panel">
          <div className="s3-panel-header">
            <strong>{t('s3.bucketList')}</strong>
          </div>

          {bucketsLoading ? (
            <LoadingStatePanel className="s3-panel-loading" rows={4} title={t('s3.bucketListLoading')} />
          ) : !hasBuckets ? (
            <EmptyStatePanel className="s3-panel-empty" title={t('s3.noBucketsTitle')} copy={t('s3.noBucketsCopy')} />
          ) : (
            <div className="bucket-list" role="list">
              {buckets.map((bucket) => (
                <button
                  key={bucket.name}
                  className={bucket.name === selectedBucketName ? 'bucket-list-item active' : 'bucket-list-item'}
                  onClick={() => onSelectBucket(bucket.name)}
                  type="button"
                >
                  <strong>{bucket.name}</strong>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="s3-object-panel">
          {!selectedBucketName ? (
            <EmptyStatePanel title={t('s3.noBucketSelectedTitle')} copy={t('s3.noBucketSelectedCopy')} />
          ) : (
            <>
              <div className="s3-object-toolbar">
                <div className="s3-breadcrumbs" aria-label="S3 path breadcrumbs">
                  <button className="s3-breadcrumb-button" onClick={() => onSelectBreadcrumb('')} type="button">
                    {t('s3.root')}
                  </button>
                  {breadcrumbs.map((crumb, index) => (
                    <span className="s3-breadcrumb-segment" key={`${crumb.label}-${crumb.prefix || index}`}>
                      <span>/</span>
                      <button className="s3-breadcrumb-button" onClick={() => onSelectBreadcrumb(crumb.prefix)} type="button">
                        {crumb.label}
                      </button>
                    </span>
                  ))}
                </div>

                <form
                  className="s3-search-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    onSearchSubmit()
                  }}
                >
                  <input
                    className="tunnel-input s3-search-input"
                    onChange={(event) => onSearchQueryChange(event.target.value)}
                    placeholder={t('s3.searchPlaceholder')}
                    value={searchQuery}
                  />
                  <button className="toolbar-button" type="submit">
                    {t('s3.searchSubmit')}
                  </button>
                </form>
              </div>

              {objectsError ? (
                <div className="callout callout-error inline-callout">
                  <strong>{t('s3.objectLookupFailed')}</strong>
                  <p>{objectsError}</p>
                </div>
              ) : null}

              <div className={visibleItemCount > 0 ? 'instance-table s3-object-table' : 'instance-table instance-table-empty s3-object-table'}>
                {objectsLoading ? (
                  <LoadingStatePanel
                    className="table-loading-state"
                    copy={t('s3.copy')}
                    rows={4}
                    title={t('s3.loadingObjects')}
                  />
                ) : null}

                {!objectsLoading && objectList && visibleItemCount === 0 ? (
                  <EmptyStatePanel
                    className="table-empty-state"
                    copy={searchQuery ? t('s3.searchEmptyCopy') : t('s3.emptyCopy')}
                    title={searchQuery ? t('s3.searchEmptyTitle') : t('s3.emptyTitle')}
                  />
                ) : null}

                {!objectsLoading && objectList && visibleItemCount > 0 ? (
                  <table className="instance-table-grid">
                    <thead>
                      <tr className="instance-table-header">
                        <th scope="col">{t('s3.col.name')}</th>
                        <th scope="col">{t('s3.col.type')}</th>
                        <th scope="col">{t('s3.col.size')}</th>
                        <th scope="col">{t('s3.col.updated')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {objectList.prefixes.map((prefix) => (
                        <tr className="instance-row" key={prefix.prefix}>
                          <th className="instance-cell instance-cell-primary" scope="row">
                            <button className="instance-row-trigger" onClick={() => onOpenPrefix(prefix.prefix)} type="button">
                              <strong>{prefix.name}</strong>
                            </button>
                          </th>
                          <td className="instance-cell">{t('s3.kind.folder')}</td>
                          <td className="instance-cell">-</td>
                          <td className="instance-cell">-</td>
                        </tr>
                      ))}
                      {objectList.objects.map((object) => (
                        <tr className="instance-row" key={object.key}>
                          <th className="instance-cell instance-cell-primary" scope="row">
                            <strong>{object.name}</strong>
                          </th>
                          <td className="instance-cell">{object.storageClass ?? t('s3.kind.object')}</td>
                          <td className="instance-cell">{formatBytes(object.size)}</td>
                          <td className="instance-cell">{object.lastModified ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </div>

              {objectList?.isTruncated ? <p className="s3-truncated-hint">{t('s3.truncatedHint')}</p> : null}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
