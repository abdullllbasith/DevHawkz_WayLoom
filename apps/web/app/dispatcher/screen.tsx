export function DispatcherScreen({ title }: { title: string }) {
  return (
    <section className="dispatcher-grid" aria-labelledby="dispatcher-screen-title">
      <h1 id="dispatcher-screen-title" className="dispatcher-span">
        {title}
      </h1>
    </section>
  );
}
