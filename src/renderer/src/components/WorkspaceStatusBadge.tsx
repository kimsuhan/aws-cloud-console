type WorkspaceStatusTone = 'ready' | 'loading' | 'mutating'

interface WorkspaceStatusBadgeProps {
  tone: WorkspaceStatusTone
  label: string
}

export function WorkspaceStatusBadge({ tone, label }: WorkspaceStatusBadgeProps): React.JSX.Element {
  return (
    <span className={`workspace-status-badge workspace-status-badge-${tone}`}>
      <span aria-hidden="true" className="workspace-status-dot" />
      <span>{label}</span>
    </span>
  )
}
