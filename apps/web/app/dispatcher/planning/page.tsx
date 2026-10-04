"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { aiFallbackMessage } from "../../../lib/ai-fallback";
import { confirmPlanOnServer } from "../../../lib/dispatcher-confirmation";
import { DEFERRAL_REASON_INFO, type DeferralReasonCode } from "../../../lib/dispatcher-deferrals";
import { readOrderList, type DispatcherOrder } from "../../../lib/dispatcher-orders";
import { StatusBadge, StatusBanner } from "../../status-banner";
import { humanActionError } from "../../../lib/status-copy";
import { noOperationalDateMessage, selectOperationalDateMessage, useOperationalDate } from "../operational-date";
import { filterTrips, planningCounts, readPlanningExplanation, readPlanningResult, type PlanTrip, type PlanningView } from "../../../lib/dispatcher-planning";
import { shortId } from "../../../lib/short-id";

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
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explainBusy, setExplainBusy] = useState(false);
  const operationalDate = useOperationalDate();

  async function load() {
    const ordersResponse = await fetch("/api/orders", { cache: "no-store" });
    const ordersPayload: unknown = await ordersResponse.json().catch(() => null);
    if (!ordersResponse.ok) {
      setOrders([]);
      setView(emptyView);
      setError("Planning data could not be loaded.");
      return;
    }
    const loadedOrders = readOrderList(ordersPayload);
    const date = operationalDate.selected;
    let next = emptyView;
    if (date !== null) {
      const planningResponse = await fetch(`/api/planning/${encodeURIComponent(date)}`, { cache: "no-store" });
      const planningPayload: unknown = await planningResponse.json().catch(() => null);
      next = planningResponse.ok ? readPlanningResult(planningPayload) : { ...emptyView, operationalDate: date };
      if (!planningResponse.ok) setError("The planning result could not be loaded.");
      else setError(null);
    } else if (operationalDate.status === "empty") {
      setError(noOperationalDateMessage);
    } else {
      setError(selectOperationalDateMessage);
    }
    setOrders(loadedOrders);
    setView(next.operationalDate === null && date !== null ? { ...next, operationalDate: date } : next);
  }

  useEffect(() => {
    if (operationalDate.status === "loading") return;
    let cancelled = false;
    load().catch(() => {
      if (!cancelled) setError("Planning data could not be loaded.");
    });
    return () => {
      cancelled = true;
    };
  }, [operationalDate.selected, operationalDate.status]);

  useEffect(() => {
    if (view.operationalDate === null || (view.trips.length === 0 && view.deferrals.length === 0)) {
      setExplanation(null);
      return;
    }
    let cancelled = false;
    setExplainBusy(true);
    void (async () => {
      try {
        const token = await csrfToken();
        const response = await fetch(`/api/planning/${encodeURIComponent(view.operationalDate ?? "")}/explanation`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { "x-wayloom-csrf": token } : {}) },
          body: JSON.stringify({}),
        });
        const payload: unknown = await response.json().catch(() => null);
        const read = readPlanningExplanation(payload);
        if (!cancelled) setExplanation(response.ok && read !== null ? read.text : aiFallbackMessage("unavailable"));
      } catch {
        if (!cancelled) setExplanation(aiFallbackMessage("unavailable"));
      } finally {
        if (!cancelled) setExplainBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view.operationalDate, view.trips.length, view.deferrals.length]);

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
    setExplanation(null);
    try {
      const token = await csrfToken();
      const response = await fetch("/api/planning/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { "x-wayloom-csrf": token } : {}) },
        body: JSON.stringify({ operationalDate: view.operationalDate }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(humanActionError(response.status, payload, "planning"));
        return;
      }
      await load();
    } catch {
      setError(humanActionError(0, null, "planning"));
    } finally {
      setBusy(null);
    }
  }

  async function explainPlan() {
    if (view.operationalDate === null || busy !== null || explainBusy) return;
    setExplainBusy(true);
    setError(null);
    try {
      const token = await csrfToken();
      const response = await fetch(`/api/planning/${encodeURIComponent(view.operationalDate)}/explanation`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { "x-wayloom-csrf": token } : {}) },
        body: JSON.stringify({}),
      });
      const payload: unknown = await response.json().catch(() => null);
      const read = readPlanningExplanation(payload);
      setExplanation(response.ok && read !== null ? read.text : aiFallbackMessage("unavailable"));
    } catch {
      setExplanation(aiFallbackMessage("unavailable"));
    } finally {
      setExplainBusy(false);
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

  if (operationalDate.status === "loading") {
    return <StatusBanner tone="loading" title="Reading the operational date" body="The planning result stays hidden until a date is selected." />;
  }
  if (operationalDate.selected === null) {
    return (
      <StatusBanner
        tone="empty"
        title={operationalDate.status === "empty" ? noOperationalDateMessage : selectOperationalDateMessage}
        body="Planning, routes, and dispatch use that date. Choose it in the header."
      />
    );
  }

  return (
    <div className="planning-page-container">
      {error && <div className="dashboard-error" role="alert">{error}</div>}
      {view.trips.length === 0 && error === null ? (
        <StatusBanner tone="info" title="No trips in this planning result" body="A confirmed order on this date can be planned. A date outside the operating calendar stays empty. Map, fuel, on-time, and CO₂ are not provided." />
      ) : null}
      <section className="planning-kpi-grid" aria-label="Planning Summary Metrics">
        <Kpi label="Vehicles on plan" value={counts.vehicles} subtitle="Distinct vehicles in the result" />
        <Kpi label="Orders scheduled" value={counts.scheduled} subtitle={`${counts.deferred} deferred`} />
      </section>
      <p className="kpi-subtitle">Map, fuel, on-time, and CO₂ are not provided.</p>

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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
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
                    <td>
                      <div className="vehicle-id-cell">
                        <span className="vehicle-id-icon" aria-hidden="true">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="1" y="6" width="15" height="10" rx="1" />
                            <polygon points="16 9 20 9 23 12 23 16 16 16 16 9" />
                            <circle cx="6" cy="18" r="2" />
                            <circle cx="18" cy="18" r="2" />
                          </svg>
                        </span>
                        <button type="button" className="cell-id-btn" title={trip.vehicleId} onClick={() => { setSelected(trip); setTab("route"); }}>{shortId(trip.vehicleId)}</button>
                      </div>
                    </td>
                    <td>—</td>
                    <td>—</td>
                    <td>{trip.tripNumber}</td>
                    <td>{trip.stops.length}</td>
                    <td>—</td>
                    <td>—</td>
                    <td>{trip.depot}</td>
                    <td><StatusBadge status={trip.status} /></td>
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
                      <td title={order?.orderId ?? deferral.orderId}>{shortId(order?.orderId ?? deferral.orderId)}</td>
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
        <div className="dashboard-card planning-route-card">
          <h3 className="route-card-title" title={activeTrip?.vehicleId}>{activeTrip ? `${shortId(activeTrip.vehicleId)} trip ${activeTrip.tripNumber}` : "Route overview"}</h3>
          <ul className="loader-checklist">
            {(activeTrip?.stops ?? []).map((stop) => {
              const order = orderById.get(stop.orderId);
              const orderLabel = order?.orderId ?? stop.orderId;
              const stopNumber = (activeTrip?.stops.some((item) => item.sequence === 0) ? stop.sequence + 1 : stop.sequence);
              return (
                <li key={stop.id} className="loader-check-item" title={orderLabel}>
                  Stop {stopNumber} · {orderLabel} · {order?.outlet ?? "—"} · {stop.plannedArrival ?? "arrival not stored"}
                </li>
              );
            })}
            {(activeTrip?.stops.length ?? 0) === 0 && <li className="loader-check-item">No stops loaded.</li>}
          </ul>
          <p className="kpi-subtitle">A map is not stored with this plan.</p>
        </div>
      </section>

      <section className="planning-bottom-grid">
        <div className="dashboard-card">
          <h3 className="bottom-card-title">Deferred orders ({view.deferrals.length})</h3>
          <ul className="loader-checklist">
            {view.deferrals.map((deferral) => {
              const order = orderById.get(deferral.orderId);
              const orderLabel = order?.orderId ?? deferral.orderId;
              return <li key={deferral.id} className="loader-check-item" title={orderLabel}>{orderLabel} · {reasonLabel(deferral.reason)}</li>;
            })}
            {view.deferrals.length === 0 && <li className="loader-check-item">No deferred orders.</li>}
          </ul>
        </div>
        <div className="dashboard-card">
          <h3 className="bottom-card-title">Plan constraints</h3>
          <ul className="loader-checklist">
            {constraintLines(view.deferrals).map((line) => <li key={line} className="loader-check-item">{line}</li>)}
          </ul>
        </div>
        <div className="dashboard-card">
          <h3 className="bottom-card-title">Plan vs previous</h3>
          <p className="kpi-subtitle">No earlier plan is stored for this date.</p>
        </div>
        <div className="dashboard-card">
          <h3 className="bottom-card-title">AI reasoning</h3>
          <p className="kpi-subtitle">{explainBusy ? "Reading the stored plan..." : explanation ?? "No stored plan to explain."}</p>
          <button type="button" className="btn-regenerate-plan" onClick={() => void explainPlan()} disabled={view.operationalDate === null || busy !== null || explainBusy || (view.trips.length === 0 && view.deferrals.length === 0)}>
            {explainBusy ? "Reading the stored plan..." : "Refresh explanation"}
          </button>
        </div>
      </section>

      <footer className="planning-footer-bar">
        <button type="button" className="btn-back-to-orders" onClick={() => router.push("/dispatcher/orders")}>← Back to Orders</button>
        <div className="footer-right-buttons">
          <button type="button" className="btn-regenerate-plan" onClick={() => void runPlanning()} disabled={view.operationalDate === null || busy !== null}>
            {busy === "run" ? "Running planning..." : "Run planning"}
          </button>
          <button type="button" className="btn-approve-plan" onClick={() => void confirmTrips()} disabled={view.trips.every((trip) => trip.status !== "PLANNED") || busy !== null}>
            {busy === "confirm" ? "Confirming allocation..." : "Approve plan"}
          </button>
        </div>
      </footer>
      <p className="kpi-subtitle">Operational date {view.operationalDate ?? "—"}</p>
    </div>
  );
}

function reasonLabel(reason: string): string {
  if (Object.prototype.hasOwnProperty.call(DEFERRAL_REASON_INFO, reason)) {
    return DEFERRAL_REASON_INFO[reason as DeferralReasonCode].label;
  }
  return reason;
}

function constraintLines(deferrals: PlanningView["deferrals"]): string[] {
  if (deferrals.length === 0) return ["No constraint failure is recorded for this plan."];
  const lines = deferrals.map((deferral) => {
    if (!Object.prototype.hasOwnProperty.call(DEFERRAL_REASON_INFO, deferral.reason)) return deferral.reason;
    const info = DEFERRAL_REASON_INFO[deferral.reason as DeferralReasonCode];
    return `${info.label}: ${info.description}`;
  });
  return [...new Set(lines)];
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
