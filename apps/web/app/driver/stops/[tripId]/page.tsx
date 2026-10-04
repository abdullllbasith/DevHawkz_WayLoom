"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { StatusBadge, StatusBanner } from "../../../status-banner";
import { readDriverTrip, type DriverTrip } from "../../../../lib/driver-routes";
import { shortId } from "../../../../lib/short-id";
import { openIndexedDbOfflineStore } from "../../../../lib/offline-store";

type LoadState =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "error" }
  | { kind: "ready"; trip: DriverTrip };

export default function DriverStopDetailsPage() {
  const params = useParams<{ tripId: string }>();
  const tripId = params.tripId;
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [savedLocally, setSavedLocally] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
      .catch(async () => {
        const store = await openIndexedDbOfflineStore().catch(() => null);
        const cached = store === null ? null : (await store.listRoutes()).find((route) => route.tripId === tripId)?.trip ?? null;
        const trip = cached === undefined || cached === null ? null : readDriverTrip(cached);
        if (!cancelled) {
          if (trip === null) setState({ kind: "error" });
          else {
            setSavedLocally(true);
            setState({ kind: "ready", trip });
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  if (state.kind === "loading") return <StatusBanner tone="loading" title="Loading stop details" body="Stops stay hidden until the assigned trip is read." />;
  if (state.kind === "missing") return <StatusBanner tone="denied" title="Stop details are not available" body="This trip is not assigned to the signed-in driver." action={<Link className="btn-primary driver-touch" href="/driver">Back to My Routes</Link>} />;
  if (state.kind === "error") return <StatusBanner tone="error" title="Stop details are unavailable" body="The trip could not be read. This is not an empty route." />;

  const trip = state.trip;
  const selected = trip.stops.find((stop) => stop.id === selectedId) ?? trip.stops[0] ?? null;

  return (
    <div className="orders-page-container">
      {savedLocally ? <StatusBanner tone="offline" title="Showing the saved route" body="The server has not confirmed this stop list." /> : null}
      <section className="driver-kpi-grid" aria-label="Stop summary">
        <Kpi label="Stops" value={String(trip.stops.length)} note="Planned sequence" />
        <Kpi label="Trip" value={String(trip.tripNumber)} note={trip.depot} />
        <Kpi label="Status" value={<StatusBadge status={trip.status} />} note={trip.operationalDate} />
        <Kpi label="Vehicle" value={shortId(trip.vehicleId)} note="Assigned vehicle" />
      </section>
      <section className="orders-middle-grid" aria-label="Delivery stops">
        <div className="dashboard-card orders-table-card">
          <div className="orders-card-header">
            <div>
              <h2 className="selected-orders-title">Delivery stops</h2>
              <p className="kpi-subtitle">{savedLocally ? "Saved Locally. The server has not confirmed this stop list." : "Stop order cannot be changed here."}</p>
            </div>
          </div>
          <div className="orders-table-wrapper">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Order</th>
                  <th>Planned arrival</th>
                </tr>
              </thead>
              <tbody>
                {trip.stops.length === 0 ? (
                  <tr><td colSpan={3} className="empty-table-cell">This trip has no stops.</td></tr>
                ) : trip.stops.map((stop) => (
                  <tr key={stop.id} className={selected?.id === stop.id ? "driver-row-selected" : undefined}>
                    <td>{stop.sequence + 1}</td>
                    <td>
                      <button type="button" className="cell-id-btn driver-id" onClick={() => setSelectedId(stop.id)}>
                        <span title={stop.orderId}>{shortId(stop.orderId)}</span>
                      </button>
                    </td>
                    <td>{formatWhen(stop.plannedArrival)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <aside className="orders-sidebar-panels">
          <div className="dashboard-card driver-side-card">
            <div className="panel-title-row">
              <span className="panel-icon tone-blue" aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </span>
              <h2 className="selected-orders-title">Selected stop</h2>
            </div>
            {selected === null ? (
              <div className="driver-note">
                <p>This trip has no stops.</p>
              </div>
            ) : (
              <>
                <div className="driver-stat">
                  <span className="driver-stat-value">{selected.sequence + 1}</span>
                  <span className="driver-stat-label">of {trip.stops.length} stops</span>
                </div>
                <ul className="driver-meta-list">
                  <li>
                    <span className="insight-icon-box icon-capacity" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </span>
                    <span>
                      <span className="driver-meta-k">Order</span>
                      <span title={selected.orderId}>{shortId(selected.orderId)}</span>
                    </span>
                  </li>
                  <li>
                    <span className="insight-icon-box icon-window" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="9" />
                        <polyline points="12 7 12 12 15 14" />
                      </svg>
                    </span>
                    <span>
                      <span className="driver-meta-k">Planned arrival</span>
                      <span>{formatWhen(selected.plannedArrival)}</span>
                    </span>
                  </li>
                  <li>
                    <span className="insight-icon-box icon-temp" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="9" />
                        <line x1="12" y1="11" x2="12" y2="16" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                    </span>
                    <span>Outlet name, address, and delivery status are not on the stop.</span>
                  </li>
                </ul>
                <div className="driver-actions">
                  <Link className="btn-primary driver-touch driver-open" href={`/driver/outcome?stop=${encodeURIComponent(selected.id)}`}>Record outcome</Link>
                  <Link className="orders-export-btn driver-touch" href={`/driver/pod?stop=${encodeURIComponent(selected.id)}`}>Add proof</Link>
                </div>
              </>
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}

function Kpi({ label, value, note }: { label: string; value: ReactNode; note: string }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value driver-kpi-value">{value}</div>
      <div className="kpi-subtitle">{note}</div>
    </div>
  );
}

function formatWhen(value: string | null): string {
  if (value === null || value.length === 0) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Colombo",
  }).format(date);
}
