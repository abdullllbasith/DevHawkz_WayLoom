"use client";

export default function DispatcherError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main>
      <h1>Dispatcher workspace is unavailable</h1>
      <p>The page could not be loaded.</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
