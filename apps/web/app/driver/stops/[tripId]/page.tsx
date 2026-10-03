"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { readDriverTrip, type DriverTrip } from "../../../../lib/driver-routes";

type LoadState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "error" }
  | { kind: "ready"; trip: DriverTrip };

export default function DriverStopDetailsPage() {
  const params = useParams<{ tripId: string }>();
  const tripId = params.tripId;
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/trips/${encodeURIComponent(tripId)}`, { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 404 || response.status === 403) {
          if (!cancelled) setState({ kind: "missing" });
          return;
        }
        if (!response.ok) throw new Error("trip_read_failed");
        const trip = readDriverTrip(await response.json());
        if (trip === null) throw new Error("trip_payload_invalid");
        if (!cancelled) setState({ kind: "ready", trip });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  if (state.kind === "loading") {
    return (
      <section className="driver-empty">
        <h2>Loading stop details</h2>
        <p>Stops stay hidden until the assigned trip is read.</p>
      </section>
    );
  }
  if (state.kind === "missing") {
    return (
      <section className="driver-empty">
        <h2>Stop details are not available</h2>
        <p>This trip is not assigned to the signed-in driver.</p>
      </section>
    );
  }
  if (state.kind === "error") {
    return (
      <section className="driver-empty">
        <h2>Stop details are unavailable</h2>
        <p>The trip could not be read. This is not an empty route.</p>
      </section>
    );
  }

  return (
    <div className="driver-list">
      <section className="driver-card">
        <h2>{state.trip.depot}</h2>
        <p>Date: {state.trip.operationalDate}</p>
        <p>Trip number: {state.trip.tripNumber}</p>
        <p>Status: {state.trip.status}</p>
        <p>Outlet, address, temperature, and access: —</p>
      </section>
      <ol className="driver-list">
        {state.trip.stops.map((stop) => (
          <li key={stop.id} className="driver-card">
            <h2>Stop {stop.sequence + 1}</h2>
            <p>Order: {stop.orderId}</p>
            <p>Arrival: {stop.plannedArrival ?? "—"}</p>
            <p>Delivery status is not shown until an outcome is recorded.</p>
            <Link href={`/driver/outcome?stop=${encodeURIComponent(stop.id)}`}>Record outcome</Link>
            <Link href={`/driver/pod?stop=${encodeURIComponent(stop.id)}`}>Add proof</Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
