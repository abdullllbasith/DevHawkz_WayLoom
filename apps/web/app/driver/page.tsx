"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { displayRouteIdentity, readDriverRoutes, type DriverTrip } from "../../lib/driver-routes";

type LoadState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error" }
  | { kind: "ready"; trips: DriverTrip[] };

export default function DriverRoutesPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/driver/routes", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("route_read_failed");
        const body: unknown = await response.json();
        const trips = readDriverRoutes(body);
        if (trips === null) throw new Error("route_payload_invalid");
        if (!cancelled) setState(trips.length === 0 ? { kind: "empty" } : { kind: "ready", trips });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "loading") {
    return (
      <section className="driver-empty">
        <h2>Loading assigned routes</h2>
        <p>Routes stay hidden until the server responds.</p>
      </section>
    );
  }
  if (state.kind === "error") {
    return (
      <section className="driver-empty">
        <h2>Assigned routes are unavailable</h2>
        <p>The route list could not be read. This is not an empty assignment.</p>
      </section>
    );
  }
  if (state.kind === "empty") {
    return (
      <section className="driver-empty">
        <h2>No assigned routes</h2>
        <p>No trip is assigned to this driver through the vehicle assignment.</p>
      </section>
    );
  }
  return (
    <div className="driver-list">
      {state.trips.map((trip) => (
        <article key={trip.id} className="driver-card">
          <h2>{displayRouteIdentity(trip)}</h2>
          <p>Date: {trip.operationalDate}</p>
          <p>Depot: {trip.depot}</p>
          <p>Trip number: {trip.tripNumber}</p>
          <p>Status: {trip.status}</p>
          <p>Vehicle: {trip.vehicleId}</p>
          <p>Stops: {trip.stops.length}</p>
          <p>Distance, ETA, and map position: —</p>
          <Link href={`/driver/stops/${encodeURIComponent(trip.id)}`}>Open stops</Link>
        </article>
      ))}
    </div>
  );
}
