export function UnavailableArea({ title }: { title: string }) {
  return (
    <section className="dashboard-card" aria-label={title}>
      <h2 className="bottom-card-title">{title}</h2>
      <p className="kpi-subtitle">This area is not available. No approved data source is connected for this screen.</p>
    </section>
  );
}
