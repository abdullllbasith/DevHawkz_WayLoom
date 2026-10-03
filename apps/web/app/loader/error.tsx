"use client";

export default function LoaderError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="loader-denied">
      <h1>Loader workspace is unavailable</h1>
      <p>The page could not be loaded.</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
