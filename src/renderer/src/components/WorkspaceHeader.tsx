interface WorkspaceHeaderProps {
  eyebrow: string
  title: string
  copy: string
  context?: React.ReactNode
  actions?: React.ReactNode
}

export function WorkspaceHeader({
  eyebrow,
  title,
  copy,
  context,
  actions
}: WorkspaceHeaderProps): React.JSX.Element {
  return (
    <>
      <div className="workspace-screen-header">
        <div className="workspace-screen-heading">
          <span className="summary-label">{eyebrow}</span>
          <h1>{title}</h1>
          <p className="workspace-screen-copy">{copy}</p>
        </div>
      </div>

      {context || actions ? (
        <div className="workspace-screen-toolbar">
          {context ? <div className="workspace-screen-context">{context}</div> : <div />}
          {actions ? <div className="workspace-screen-actions">{actions}</div> : null}
        </div>
      ) : null}
    </>
  )
}
