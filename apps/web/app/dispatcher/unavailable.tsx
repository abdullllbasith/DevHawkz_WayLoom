export function WorkspaceNotice({ title, body }: { title: string; body: string }) {
  return (
    <section className="workspace-notice">
      <span className="workspace-notice-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </span>
      <div>
        <h1>{title}</h1>
        <p>{body}</p>
      </div>
    </section>
  );
}

export function UnavailableArea({ title }: { title: string }) {
  return (
    <WorkspaceNotice
      title={`${title} is not available`}
      body="No approved data source is connected for this screen."
    />
  );
}
