"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { confirmPlanOnServer } from "../../../lib/dispatcher-confirmation";
import { latestOrderDate, readOrderList, type DispatcherOrder } from "../../../lib/dispatcher-orders";
import { filterTrips, planningCounts, readPlanningResult, type PlanTrip, type PlanningView } from "../../../lib/dispatcher-planning";

const emptyView: PlanningView = { operationalDate: null, trips: [], deferrals: [] };

export default function DispatcherPlanningPage() {
  const router = useRouter();
  const [view, setView] = useState<PlanningView>(emptyView);
  const [orders, setOrders] = useState<DispatcherOrder[]>([]);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"vehicles" | "route" | "unassigned" | "comparison">("vehicles");
  const [selected, setSelected] = useState<PlanTrip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"run" | "confirm" | null>(null);

  async function load() {
    const ordersResponse = await fetch("/api/orders", { cache: "no-store" });
    const ordersPayload: unknown = await ordersResponse.json().catch(() => null);
    const loadedOrders = ordersResponse.ok ? readOrderList(ordersPayload) : [];
    const date = latestOrderDate(loadedOrders);
    let next = emptyView;
    if (date !== null) {
      const planningResponse = await fetch(`/api/planning/${encodeURIComponent(date)}`, { cache: "no-store" });
      const planningPayload: unknown = await planningResponse.json().catch(() => null);
      next = planningResponse.ok ? readPlanningResult(planningPayload) : { ...emptyView, operationalDate: date };
      if (!planningResponse.ok) setError("The planning result could not be loaded.");
    }
    setOrders(loadedOrders);
    setView(next.operationalDate === null && date !== null ? { ...next, operationalDate: date } : next);
  }

  useEffect(() => {
    let cancelled = false;
    load().catch(() => {
      if (!cancelled) setError("Planning data could not be loaded.");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = planningCounts(view);
  const trips = filterTrips(view.trips, query);
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const activeTrip = selected ?? trips[0] ?? null;

  async function csrfToken() {
    const response = await fetch("/api/auth/csrf");
    if (!response.ok) return "";
    const data = (await response.json()) as { csrfToken?: string };
    return data.csrfToken ?? "";
  }

  async function runPlanning() {
    if (view.operationalDate === null || busy !== null) return;
    setBusy("run");
    setError(null);
    try {
      const token = await csrfToken();
      const response = await fetch("/api/planning/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { "x-wayloom-csrf": token } : {}) },
        body: JSON.stringify({ operationalDate: view.operationalDate }),
      });
      if (!response.ok) {
        setError("Planning did not run.");
        return;
      }
      await load();
    } catch {
      setError("Planning could not be reached.");
    } finally {
      setBusy(null);
    }
  }

  async function confirmTrips() {
    const planned = view.trips.filter((trip) => trip.status === "PLANNED").map((trip) => trip.id);
    if (planned.length === 0 || busy !== null) return;
    setBusy("confirm");
    setError(null);
    const result = await confirmPlanOnServer({ tripIds: planned, csrfToken: await csrfToken() });
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      await load();
      return;
    }
    router.push("/dispatcher/allocation-confirmation");
  }

  return (
    <div className="planning-page-container">
      {error && <div className="dashboard-error" role="alert">{error}</div>}
      <section className="planning-kpi-grid" aria-label="Planning Summary Metrics">
        <Kpi label="Vehicles on plan" value={counts.vehicles} subtitle="Distinct vehicles in the result" />
        <Kpi label="Orders scheduled" value={counts.scheduled} subtitle={`${counts.deferred} deferred`} />
        <Kpi label="Estimated on-time" value="—" subtitle="Not in the planning result" />
        <Kpi label="Estimated fuel" value="—" subtitle="Not in the planning result" />
        <Kpi label="CO₂ reduction" value="—" subtitle="Not in the planning result" />
        <Kpi label="Constraint violations" value="—" subtitle="Feasibility stays on the server" />
      </section>

      <section className="planning-tab-bar">
        <div className="tab-pill-group" role="tablist">
          <TabButton active={tab === "vehicles"} onClick={() => setTab("vehicles")}>Vehicle assignments ({view.trips.length})</TabButton>
          <TabButton active={tab === "route"} onClick={() => setTab("route")}>Route plan</TabButton>
          <TabButton active={tab === "unassigned"} onClick={() => setTab("unassigned")}>Unassigned orders ({view.deferrals.length})</TabButton>
          <button type="button" className="planning-tab-btn" disabled>Plan comparison unavailable</button>
        </div>
        <button type="button" className="edit-plan-btn" disabled>Edit plan unavailable</button>
      </section>

      <section className="planning-middle-grid">
        <div className="dashboard-card planning-table-card">
          <div className="planning-search-box">
            <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Filter trips" placeholder="Search vehicle, depot, or status" />
          </div>
          {tab !== "unassigned" ? (
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Vehicle ID</th><th>Type</th><th>Driver</th><th>Trip</th><th>Orders</th><th>Load (kg)</th><th>Load %</th><th>Depot</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {trips.map((trip) => (
                  <tr key={trip.id}>
                    <td><button type="button" className="cell-id-btn" onClick={() => { setSelected(trip); setTab("route"); }}>{trip.vehicleId}</button></td>
                    <td>—</td>
                    <td>—</td>
                    <td>{trip.tripNumber}</td>
                    <td>{trip.stops.length}</td>
                    <td>—</td>
                    <td>—</td>
                    <td>{trip.depot}</td>
                    <td>{trip.status}</td>
                  </tr>
                ))}
                {trips.length === 0 && <tr><td colSpan={9}>No trips in the planning result.</td></tr>}
              </tbody>
            </table>
          ) : (
            <table className="orders-table">
              <thead><tr><th>Order</th><th>Outlet</th><th>Reason</th><th>Priority</th><th>Reported</th></tr></thead>
              <tbody>
                {view.deferrals.map((deferral) => {
                  const order = orderById.get(deferral.orderId);
                  return (
                    <tr key={deferral.id}>
                      <td>{order?.orderId ?? deferral.orderId}</td>
                      <td>{order?.outlet ?? "—"}</td>
                      <td>{deferral.reason}</td>
                      <td>—</td>
                      <td>{deferral.reportedAt}</td>
                    </tr>
                  );
                })}
                {view.deferrals.length === 0 && <tr><td colSpan={5}>No deferred orders in the planning result.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
        <div className="dashboard-card">
          <h3 className="bottom-card-title">{activeTrip ? `${activeTrip.vehicleId} trip ${activeTrip.tripNumber}` : "Route overview"}</h3>
          <p className="kpi-subtitle">Distance, duration, and map geometry are not in the planning result.</p>
          <ul>
            {(activeTrip?.stops ?? []).map((stop) => {
              const order = orderById.get(stop.orderId);
              return <li key={stop.id}>{stop.sequence}. {order?.orderId ?? stop.orderId} {order?.outlet ?? ""} {stop.plannedArrival ?? "—"}</li>;
            })}
            {(activeTrip?.stops.length ?? 0) === 0 && <li>No stops loaded.</li>}
          </ul>
        </div>
      </section>

      <section className="planning-bottom-grid">
        <div className="dashboard-card">
          <h3 className="bottom-card-title">Deferred orders ({view.deferrals.length})</h3>
          <p className="kpi-subtitle">Suggested actions are not provided. Reason codes stay as returned.</p>
        </div>
        <div className="dashboard-card">
          <h3 className="bottom-card-title">Plan constraints</h3>
          <p className="kpi-subtitle">The server feasibility result is authoritative. This screen does not recheck constraints.</p>
        </div>
        <div className="dashboard-card">
          <h3 className="bottom-card-title">Plan vs previous</h3>
          <p className="kpi-subtitle">No previous plan comparison is stored.</p>
        </div>
        <div className="dashboard-card">
          <h3 className="bottom-card-title">AI reasoning</h3>
          <p className="kpi-subtitle">No AI explanation is included in the planning result.</p>
        </div>
      </section>

      <footer className="planning-footer-bar">
        <button type="button" className="btn-back-to-orders" onClick={() => router.push("/dispatcher/orders")}>← Back to Orders</button>
        <div className="footer-right-buttons">
          <button type="button" className="btn-regenerate-plan" onClick={() => void runPlanning()} disabled={view.operationalDate === null || busy !== null}>
            {busy === "run" ? "Running planning..." : "Run planning"}
          </button>
          <button type="button" className="btn-approve-plan" onClick={() => void confirmTrips()} disabled={view.trips.every((trip) => trip.status !== "PLANNED") || busy !== null}>
            {busy === "confirm" ? "Confirming allocation..." : "Approve plan & send to loader"}
          </button>
        </div>
      </footer>
      <p className="kpi-subtitle">Operational date {view.operationalDate ?? "—"}</p>
    </div>
  );
}

function Kpi({ label, value, subtitle }: { label: string; value: string; subtitle: string }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-subtitle">{subtitle}</div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" role="tab" aria-selected={active} className={`planning-tab-btn ${active ? "active" : ""}`} onClick={onClick}>{children}</button>;
}
