"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { displayRouteIdentity, readDriverRoutes, type DriverTrip } from "../../lib/driver-routes";
import { reconcileOfflineEvents } from "../../lib/offline-policy";
import { cacheDriverRoutes, readAssignedRoutes, submitSyncBatch } from "../../lib/offline-reconciliation";
import { openIndexedDbOfflineStore, type PendingSyncEvent } from "../../lib/offline-store";

type LoadState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error" }
  | { kind: "ready"; trips: DriverTrip[] };

export default function DriverRoutesPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [source, setSource] = useState<"server" | "saved">("server");
  const [syncEvents, setSyncEvents] = useState<PendingSyncEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
      const store = await openIndexedDbOfflineStore();
      if (typeof navigator === "undefined" || navigator.onLine) {
        await reconcileOfflineEvents({
          store,
          submit: (events) => submitPending(events),
          refresh: (trips) => cacheDriverRoutes(store, trips, new Date().toISOString()),
          readRoutes: () => readAssignedRoutes(),
        }).catch(() => undefined);
      }
      const events = await store.listEvents();
      if (!cancelled) setSyncEvents(events);
      const routes = await readAssignedRoutes();
      if (routes.ok) {
        await cacheDriverRoutes(store, routes.trips, new Date().toISOString());
        if (!cancelled) {
          setSource("server");
          setState(routes.trips.length === 0 ? { kind: "empty" } : { kind: "ready", trips: routes.trips });
        }
        return;
      }
      const cached = (await store.listRoutes()).map((route) => route.trip);
      const trips = readDriverRoutes(cached);
      if (!cancelled) {
        if (trips === null || trips.length === 0) setState({ kind: "error" });
        else {
          setSource("saved");
          setState({ kind: "ready", trips });
        }
      }
      } catch {
        if (!cancelled) setState({ kind: "error" });
      }
    };
    const onOnline = () => {
      void load();
    };
    void load();
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
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
      <section className="driver-card">
        <h2>Synchronization</h2>
        {source === "saved" ? <p>Saved Locally. The server has not confirmed this route list.</p> : <p>Route list read from the server.</p>}
        {syncEvents.length === 0 ? <p>No local delivery events.</p> : syncEvents.map((event) => (
          <p key={event.clientEventId}>{event.eventType}: {event.state}</p>
        ))}
      </section>
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

async function submitPending(events: readonly PendingSyncEvent[]) {
  const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
  const csrfBody: unknown = csrfResponse.ok ? await csrfResponse.json() : null;
  const token = typeof csrfBody === "object" && csrfBody !== null && "csrfToken" in csrfBody && typeof csrfBody.csrfToken === "string" ? csrfBody.csrfToken : "";
  return submitSyncBatch({ events, csrfToken: token });
}
