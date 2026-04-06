interface EmptyStatePanelProps {
  title: string
  copy?: string
  className?: string
  eyebrow?: string
}

export function EmptyStatePanel({
  title,
  copy,
  className,
  eyebrow
}: EmptyStatePanelProps): React.JSX.Element {
  const classes = className ? `empty-state-panel ${className}` : 'empty-state-panel'

  return (
    <div className={classes} role="note">
      {eyebrow ? <span className="summary-label">{eyebrow}</span> : null}
      <strong>{title}</strong>
      {copy ? <p>{copy}</p> : null}
    </div>
  )
}
