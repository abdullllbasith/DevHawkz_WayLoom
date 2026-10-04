"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { confirmationCards, unavailableApproval } from "../../../lib/dispatcher-confirmation";
import { readOrderList, type DispatcherOrder } from "../../../lib/dispatcher-orders";
import { noOperationalDateMessage, useOperationalDate } from "../operational-date";
import { readPlanningResult, type PlanningView } from "../../../lib/dispatcher-planning";

export function ApprovedPlanView() {
  const router = useRouter();
  const [view, setView] = useState<PlanningView>({ operationalDate: null, trips: [], deferrals: [] });
  const [orders, setOrders] = useState<DispatcherOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const operationalDate = useOperationalDate();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const ordersResponse = await fetch("/api/orders", { cache: "no-store" });
        const ordersPayload: unknown = await ordersResponse.json().catch(() => null);
        if (!ordersResponse.ok) {
          if (!cancelled) {
            setOrders([]);
            setView({ operationalDate: null, trips: [], deferrals: [] });
            setError("Confirmation data could not be loaded.");
          }
          return;
        }
        const loaded = readOrderList(ordersPayload);
        const date = operationalDate.selected;
        let planning: PlanningView = { operationalDate: date, trips: [], deferrals: [] };
        if (date !== null) {
          const planningResponse = await fetch(`/api/planning/${encodeURIComponent(date)}`, { cache: "no-store" });
          const payload: unknown = await planningResponse.json().catch(() => null);
          if (planningResponse.ok) planning = readPlanningResult(payload);
          else if (!cancelled) setError("The planning result could not be loaded.");
        }
        if (!cancelled) {
          setOrders(loaded);
          setView(planning);
          if (date === null && operationalDate.status === "empty") setError(noOperationalDateMessage);
        }
      } catch {
        if (!cancelled) setError("Confirmation data could not be loaded.");
      }
    }
    if (operationalDate.status === "loading") return () => {
      cancelled = true;
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [operationalDate.selected, operationalDate.status]);

  const confirmed = view.trips.filter((trip) => trip.status === "CONFIRMED");
  const scheduledStops = view.trips.flatMap((trip) => trip.stops.map((stop) => ({ trip, stop })));
  const cards = confirmationCards({
    confirmedTrips: confirmed.length,
    scheduledStops: scheduledStops.length,
    deferred: view.deferrals.length,
  });
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const approved = confirmed.length > 0 && confirmed.length === view.trips.length && view.trips.length > 0;

  return (
    <div className="approved-page-container">
      {error && <div className="dashboard-error" role="alert">{error}</div>}
      <section className="plan-approved-banner" role="region" aria-label="Approval Notification">
        <div className="approved-banner-left">
          <div className="approved-icon-circle" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div>
            <h2 className="approved-banner-title">{approved ? "Delivery Plan Approved" : "Delivery plan not confirmed"}</h2>
            <p className="approved-banner-sub">
              {approved
                ? "Every trip in this planning result is confirmed. Loader notification is not recorded by confirmation."
                : "This screen shows the planning result. Confirmation is recorded only after the server accepts each planned trip."}
            </p>
          </div>
        </div>
        <div className="approved-banner-right">
          <Meta label="Plan ID" value={unavailableApproval.planId} />
          <Meta label="Approved by" value={unavailableApproval.approvedBy} />
          <Meta label="Approved at" value={unavailableApproval.approvedAt} />
        </div>
      </section>

      <section className="approved-kpi-grid" aria-label="Plan Overview Summary">
        {cards.map((card) => (
          <div key={card.id} className="approved-kpi-card">
            <div className="approved-kpi-left">
              <div className={`approved-kpi-icon-box ${card.id === "on-time" ? "clock" : card.id === "fuel" ? "fuel" : card.id === "orders" ? "orders" : "vehicle"}`} aria-hidden="true" />
              <div className="approved-kpi-text-block">
                <div className="approved-kpi-count">{card.count}</div>
                <div className="approved-kpi-label">{card.label}</div>
                <div className={`approved-kpi-pill ${card.count === "—" ? "blue" : "green"}`}>{card.pillText}</div>
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="approved-middle-grid" aria-label="Vehicle Assignments and Loader Notification">
        <div className="dashboard-card approved-card">
          <div className="card-header-row">
            <h3 className="bottom-card-title">Vehicle Assignments Summary</h3>
            <Link href="/dispatcher/planning" className="card-link-action">Back to planning</Link>
          </div>
          <div className="approved-table-wrapper">
            <table className="orders-table approved-table">
              <thead><tr><th>Vehicle</th><th>Type</th><th>Driver</th><th>Orders</th><th>Load</th><th>Depot</th><th>Status</th></tr></thead>
              <tbody>
                {view.trips.map((trip) => (
                  <tr key={trip.id}>
                    <td>
                      <div className="vehicle-id-cell">
                        <span className="vehicle-id-icon" aria-hidden="true" />
                        <span className="vehicle-code-text">{trip.vehicleId}</span>
                      </div>
                    </td>
                    <td><span className="type-text">—</span></td>
                    <td>—</td>
                    <td><span className="orders-count-text">{trip.stops.length}</span></td>
                    <td>—</td>
                    <td>{trip.routeId ?? trip.depot}</td>
                    <td><span className={trip.status === "CONFIRMED" ? "status-badge-assigned" : "type-text"}>{trip.status}</span></td>
                  </tr>
                ))}
                {view.trips.length === 0 && <tr><td colSpan={7}>No trips for {view.operationalDate ?? "the loaded date"}.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="dashboard-card approved-card loader-card">
          <div className="card-header-row">
            <h3 className="bottom-card-title">Loader Notification</h3>
            <span className="type-text">Not recorded</span>
          </div>
          <div className="loader-info-box">
            <div className="warehouse-icon-box" aria-hidden="true" />
            <p className="loader-info-text">Confirmation does not create a loader notification or a loading manifest.</p>
          </div>
          <ul className="loader-checklist" aria-label="Loader status">
            <li className="loader-check-item"><span>Warehouse notification —</span></li>
            <li className="loader-check-item"><span>Loading manifest —</span></li>
          </ul>
          <button type="button" className="btn-view-manifest" disabled>View loading manifest unavailable</button>
        </div>
      </section>

      <section className="dashboard-card approved-card" aria-label="Scheduled orders">
        <h3 className="bottom-card-title">Scheduled orders ({scheduledStops.length})</h3>
        <div className="approved-table-wrapper">
          <table className="orders-table approved-table">
            <thead><tr><th>Sequence</th><th>Order</th><th>Outlet</th><th>Vehicle</th><th>Planned arrival</th><th>Trip status</th></tr></thead>
            <tbody>
              {scheduledStops.map(({ trip, stop }) => {
                const order = orderById.get(stop.orderId);
                return (
                  <tr key={stop.id}>
                    <td>{stop.sequence}</td>
                    <td>{order?.orderId ?? stop.orderId}</td>
                    <td>{order?.outlet ?? "—"}</td>
                    <td>{trip.vehicleId}</td>
                    <td>{stop.plannedArrival ?? "—"}</td>
                    <td>{trip.status}</td>
                  </tr>
                );
              })}
              {scheduledStops.length === 0 && <tr><td colSpan={6}>No scheduled orders in the planning result.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="approved-bottom-grid" aria-label="Deferred Orders and Next Steps">
        <div className="dashboard-card approved-card">
          <div className="card-header-row">
            <h3 className="bottom-card-title">Deferred Orders ({view.deferrals.length})</h3>
            <Link href="/dispatcher/deferrals" className="card-link-action">View deferrals</Link>
          </div>
          <div className="approved-table-wrapper">
            <table className="orders-table approved-table">
              <thead><tr><th>Order</th><th>Outlet</th><th>Reason</th><th>Priority</th><th>Suggested action</th></tr></thead>
              <tbody>
                {view.deferrals.map((deferral) => {
                  const order = orderById.get(deferral.orderId);
                  return (
                    <tr key={deferral.id}>
                      <td>{order?.orderId ?? deferral.orderId}</td>
                      <td>{order?.outlet ?? "—"}</td>
                      <td>{deferral.reason}</td>
                      <td>—</td>
                      <td>—</td>
                    </tr>
                  );
                })}
                {view.deferrals.length === 0 && <tr><td colSpan={5}>No deferred orders.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="dashboard-card approved-card next-steps-card">
          <div className="card-header-row">
            <h3 className="bottom-card-title">Next Steps</h3>
            <button type="button" className="btn-return-dashboard" onClick={() => router.push("/dispatcher")}>← Return to Dashboard</button>
          </div>
          <div className="next-steps-timeline">
            <Step n="1" current={approved} title="Delivery plan confirmation" detail={approved ? "Each planned trip is confirmed." : "Waiting for the server to confirm each planned trip."} />
            <Step n="2" current={false} title="Warehouse loading" detail="Not started. Confirmation does not create a loading task." />
            <Step n="3" current={false} title="Driver dispatch" detail="Not available from this planning result." />
          </div>
        </div>
      </section>
    </div>
  );
}

function Step({ n, current, title, detail }: { n: string; current: boolean; title: string; detail: string }) {
  return (
    <div className="timeline-step-row">
      <span className={`step-circle ${current ? "current" : "future"}`}>{n}</span>
      <div className="step-content">
        <div className="step-title-line">
          <span className="step-title">{title}</span>
        </div>
        <p className="step-desc">{detail}</p>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="approved-meta-item">
      <span className="meta-label">{label}</span>
      <span className="meta-val">{value}</span>
    </div>
  );
}
