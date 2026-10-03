"use client";

export default function StoreError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="store-denied">
      <h1>Store Manager workspace is unavailable</h1>
      <p>The page could not be loaded.</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
