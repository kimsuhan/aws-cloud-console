interface LoadingStatePanelProps {
  title: string
  copy?: string
  className?: string
  rows?: number
}

export function LoadingStatePanel({
  title,
  copy,
  className,
  rows = 3
}: LoadingStatePanelProps): React.JSX.Element {
  const classes = className ? `loading-state-panel ${className}` : 'loading-state-panel'

  return (
    <div aria-live="polite" className={classes} role="status">
      <div className="loading-state-copy">
        <span className="summary-label">Loading</span>
        <strong>{title}</strong>
        {copy ? <p>{copy}</p> : null}
      </div>
      <div aria-hidden="true" className="loading-skeleton" data-rows={rows}>
        {Array.from({ length: rows }, (_, index) => (
          <span className="loading-skeleton-row" key={index} />
        ))}
      </div>
    </div>
  )
}
