"use client";

export default function DriverError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="driver-denied">
      <h1>Driver workspace is unavailable</h1>
      <p>The page could not be loaded.</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
