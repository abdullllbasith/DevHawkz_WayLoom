"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { StatusBadge, StatusBanner } from "../status-banner";
import { displayRouteIdentity, readDriverRoutes, type DriverTrip } from "../../lib/driver-routes";
import { shortId } from "../../lib/short-id";
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
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "CONFIRMED" | "PLANNED">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  if (state.kind === "loading") return <StatusBanner tone="loading" title="Loading assigned routes" body="Routes stay hidden until the server responds." />;
  if (state.kind === "error") return <StatusBanner tone="error" title="Assigned routes are unavailable" body="The route list could not be read. This is not an empty assignment." />;
  if (state.kind === "empty") return <StatusBanner tone="empty" title="No assigned routes" body="No trip is assigned to this driver through the vehicle assignment." />;

  return (
    <RouteBoard
      trips={state.trips}
      source={source}
      syncEvents={syncEvents}
      query={query}
      filter={filter}
      selectedId={selectedId}
      onQuery={setQuery}
      onFilter={setFilter}
      onSelect={setSelectedId}
    />
  );
}

function RouteBoard({
  trips,
  source,
  syncEvents,
  query,
  filter,
  selectedId,
  onQuery,
  onFilter,
  onSelect,
}: {
  trips: DriverTrip[];
  source: "server" | "saved";
  syncEvents: PendingSyncEvent[];
  query: string;
  filter: "all" | "CONFIRMED" | "PLANNED";
  selectedId: string | null;
  onQuery: (value: string) => void;
  onFilter: (value: "all" | "CONFIRMED" | "PLANNED") => void;
  onSelect: (id: string) => void;
}) {
  const confirmed = trips.filter((trip) => trip.status === "CONFIRMED").length;
  const planned = trips.filter((trip) => trip.status === "PLANNED").length;
  const stops = trips.reduce((sum, trip) => sum + trip.stops.length, 0);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return trips.filter((trip) => {
      if (filter !== "all" && trip.status !== filter) return false;
      if (needle.length === 0) return true;
      return `${displayRouteIdentity(trip)} ${trip.id} ${trip.routeId ?? ""} ${trip.depot} ${trip.vehicleId} ${trip.operationalDate}`.toLowerCase().includes(needle);
    });
  }, [trips, query, filter]);
  const selected = visible.find((trip) => trip.id === selectedId) ?? visible[0] ?? null;

  return (
    <div className="orders-page-container">
      {source === "saved" ? <StatusBanner tone="offline" title="Showing the saved route" body="The server has not confirmed this list." /> : null}
      {syncEvents.length > 0 ? <StatusBanner tone="offline" title="Saved on this device" body="The server has not confirmed these delivery events." /> : null}
      <section className="driver-kpi-grid" aria-label="Assigned route summary">
        <Kpi label="Assigned routes" value={String(trips.length)} note="Trips for this driver" />
        <Kpi label="Stops" value={String(stops)} note="Across the assigned trips" />
        <Kpi label="Confirmed" value={String(confirmed)} note="Trip status confirmed" />
        <Kpi label="Planned" value={String(planned)} note="Trip status planned" />
      </section>
      <section className="orders-action-bar" aria-label="Route filters">
        <div className="order-filter-tabs" role="tablist">
          <Tab label={`All (${trips.length})`} active={filter === "all"} onClick={() => onFilter("all")} />
          <Tab label={`Confirmed (${confirmed})`} active={filter === "CONFIRMED"} onClick={() => onFilter("CONFIRMED")} />
          <Tab label={`Planned (${planned})`} active={filter === "PLANNED"} onClick={() => onFilter("PLANNED")} />
        </div>
        <div className="orders-table-tools">
          <div className="orders-search-box">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search route, depot, or vehicle" aria-label="Search assigned routes" />
          </div>
        </div>
      </section>
      <section className="orders-middle-grid" aria-label="Assigned routes">
        <div className="dashboard-card orders-table-card">
          <div className="orders-card-header">
            <div>
              <h2 className="selected-orders-title">Assigned routes</h2>
              <p className="kpi-subtitle">{source === "saved" ? "Saved Locally. The server has not confirmed this route list." : "Route list read from the server."}</p>
            </div>
          </div>
          <div className="orders-table-wrapper">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Route</th>
                  <th>Date</th>
                  <th>Depot</th>
                  <th>Trip</th>
                  <th>Stops</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr><td colSpan={6} className="empty-table-cell">No assigned routes match this filter.</td></tr>
                ) : visible.map((trip) => (
                  <tr key={trip.id} className={selected?.id === trip.id ? "driver-row-selected" : undefined}>
                    <td><button type="button" className="cell-id-btn driver-id" onClick={() => onSelect(trip.id)}>{displayRouteIdentity(trip)}</button></td>
                    <td>{trip.operationalDate}</td>
                    <td>{trip.depot}</td>
                    <td>{trip.tripNumber}</td>
                    <td>{trip.stops.length}</td>
                    <td><Status value={trip.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <aside className="orders-sidebar-panels">
          <div className="dashboard-card driver-side-card">
            <div className="panel-title-row">
              <span className="panel-icon tone-blue" aria-hidden="true"><RouteIcon /></span>
              <h2 className="selected-orders-title">Selected route</h2>
            </div>
            {selected === null ? (
              <div className="driver-note">
                <span className="insight-icon-box icon-window" aria-hidden="true"><InfoIcon /></span>
                <p>Select a route to open its stops.</p>
              </div>
            ) : (
              <>
                <div className="driver-route-head">
                  <div>
                    <p className="driver-route-id">{displayRouteIdentity(selected)}</p>
                    <p className="driver-route-sub">{selected.depot} · Trip {selected.tripNumber}</p>
                  </div>
                  <StatusBadge status={selected.status} />
                </div>
                <div className="driver-stat">
                  <span className="driver-stat-value">{selected.stops.length}</span>
                  <span className="driver-stat-label">{selected.stops.length === 1 ? "Stop on this trip" : "Stops on this trip"}</span>
                </div>
                <ul className="driver-meta-list">
                  <li>
                    <span className="insight-icon-box icon-capacity" aria-hidden="true"><TruckIcon /></span>
                    <span>
                      <span className="driver-meta-k">Vehicle</span>
                      <span title={selected.vehicleId}>{shortId(selected.vehicleId)}</span>
                    </span>
                  </li>
                  <li>
                    <span className="insight-icon-box icon-window" aria-hidden="true"><InfoIcon /></span>
                    <span>Distance, arrival time, and map position are not on the trip.</span>
                  </li>
                </ul>
                <Link className="btn-primary driver-touch driver-open" href={`/driver/stops/${encodeURIComponent(selected.id)}`}>
                  Open stops
                  <ArrowIcon />
                </Link>
              </>
            )}
          </div>
          <div className="dashboard-card driver-side-card">
            <div className="panel-title-row">
              <span className={`panel-icon ${syncEvents.length === 0 ? "tone-green" : "tone-amber"}`} aria-hidden="true"><SyncIcon /></span>
              <h2 className="insights-card-title">Synchronization</h2>
            </div>
            {syncEvents.length === 0 ? (
              <div className="driver-sync-empty">
                <CheckIcon />
                <p>No local delivery events.</p>
              </div>
            ) : (
              <ul className="driver-sync-list">
                {syncEvents.map((event) => (
                  <li key={event.clientEventId} className="driver-sync-row">
                    <span className="driver-sync-type">{event.eventType}</span>
                    <span className={`driver-sync-state ${syncTone(event.state)}`}>{event.state}</span>
                    {event.attention === undefined ? null : <span className="driver-sync-note">{event.attention}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-subtitle">{note}</div>
    </div>
  );
}

function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" role="tab" aria-selected={active} className={`order-tab-btn ${active ? "active" : ""}`} onClick={onClick}>
      {label}
    </button>
  );
}

function Status({ value }: { value: DriverTrip["status"] }) {
  return <StatusBadge status={value} />;
}

function syncTone(state: PendingSyncEvent["state"]): string {
  if (state === "Synced") return "is-done";
  if (state === "Failed / Needs Attention") return "is-warn";
  return "is-active";
}

function RouteIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="19" r="3" />
      <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
      <circle cx="18" cy="5" r="3" />
    </svg>
  );
}

function TruckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="6" width="15" height="10" rx="1" />
      <polygon points="16 9 20 9 23 12 23 16 16 16 16 9" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function SyncIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
      <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <polyline points="8 12 11 15 16 9" />
    </svg>
  );
}

async function submitPending(events: readonly PendingSyncEvent[]) {
  const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
  const csrfBody: unknown = csrfResponse.ok ? await csrfResponse.json() : null;
  const token = typeof csrfBody === "object" && csrfBody !== null && "csrfToken" in csrfBody && typeof csrfBody.csrfToken === "string" ? csrfBody.csrfToken : "";
  return submitSyncBatch({ events, csrfToken: token });
}
