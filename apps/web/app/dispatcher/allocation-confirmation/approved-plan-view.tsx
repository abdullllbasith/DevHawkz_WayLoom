"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { confirmationCards, unavailableApproval } from "../../../lib/dispatcher-confirmation";
import { readOrderList, latestOrderDate, type DispatcherOrder } from "../../../lib/dispatcher-orders";
import { readPlanningResult, type PlanningView } from "../../../lib/dispatcher-planning";

export function ApprovedPlanView() {
  const router = useRouter();
  const [view, setView] = useState<PlanningView>({ operationalDate: null, trips: [], deferrals: [] });
  const [orders, setOrders] = useState<DispatcherOrder[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const ordersResponse = await fetch("/api/orders", { cache: "no-store" });
        const ordersPayload: unknown = await ordersResponse.json().catch(() => null);
        const loaded = ordersResponse.ok ? readOrderList(ordersPayload) : [];
        const date = latestOrderDate(loaded);
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
        }
      } catch {
        if (!cancelled) setError("Confirmation data could not be loaded.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const confirmed = view.trips.filter((trip) => trip.status === "CONFIRMED");
  const cards = confirmationCards({
    confirmedTrips: confirmed.length,
    scheduledStops: confirmed.reduce((sum, trip) => sum + trip.stops.length, 0),
    deferred: view.deferrals.length,
  });
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const approved = confirmed.length > 0 && confirmed.length === view.trips.length && view.trips.length > 0;

  return (
    <div className="approved-page-container">
      {error && <div className="dashboard-error" role="alert">{error}</div>}
      <section className="plan-approved-banner" role="region" aria-label="Approval Notification">
        <div className="approved-banner-left">
          <div>
            <h2 className="approved-banner-title">{approved ? "Delivery plan confirmed" : "Allocation confirmation"}</h2>
            <p className="approved-banner-sub">
              {approved
                ? "Every trip in this planning result is confirmed. Loader work is not started from this screen."
                : "Confirmation is recorded only after the server accepts each planned trip."}
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
            <div className="approved-kpi-text-block">
              <div className="approved-kpi-count">{card.count}</div>
              <div className="approved-kpi-label">{card.label}</div>
              <div className="approved-kpi-pill green">{card.pillText}</div>
            </div>
          </div>
        ))}
      </section>

      <section className="approved-middle-grid">
        <div className="dashboard-card approved-card">
          <h3 className="bottom-card-title">Vehicle assignments summary</h3>
          <table className="orders-table">
            <thead><tr><th>Vehicle</th><th>Type</th><th>Driver</th><th>Orders</th><th>Load</th><th>Depot</th><th>Status</th></tr></thead>
            <tbody>
              {view.trips.map((trip) => (
                <tr key={trip.id}>
                  <td>{trip.vehicleId}</td><td>—</td><td>—</td><td>{trip.stops.length}</td><td>—</td><td>{trip.depot}</td><td>{trip.status}</td>
                </tr>
              ))}
              {view.trips.length === 0 && <tr><td colSpan={7}>No trips for {view.operationalDate ?? "the loaded date"}.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="dashboard-card approved-card">
          <h3 className="bottom-card-title">Loader notification</h3>
          <p className="loader-info-text">The API does not record a loader notification or a loading manifest from confirmation.</p>
          <button type="button" className="btn-view-manifest" disabled>View loading manifest unavailable</button>
        </div>
      </section>

      <section className="approved-bottom-grid">
        <div className="dashboard-card approved-card">
          <h3 className="bottom-card-title">Deferred orders ({view.deferrals.length})</h3>
          <table className="orders-table">
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
          <Link href="/dispatcher/deferrals">View deferrals</Link>
        </div>
        <div className="dashboard-card approved-card">
          <h3 className="bottom-card-title">Next steps</h3>
          <p className="step-desc">Warehouse loading, driver dispatch, and live delivery progress are not started by confirmation.</p>
          <button type="button" className="btn-return-dashboard" onClick={() => router.push("/dispatcher")}>← Return to Dashboard</button>
        </div>
      </section>
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
