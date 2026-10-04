"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  countOrdersByCategory,
  dashboardAlerts,
  dashboardKpis,
  filterOrders,
  planningSummary,
  readOrders,
  readPlanning,
  unsupportedCategoryTab,
  type DashboardOrder,
  type DashboardTrip,
  type OrderCategoryTab,
} from "../../lib/dispatcher-dashboard";
import { noOperationalDateMessage, selectOperationalDateMessage, useOperationalDate } from "./operational-date";

export default function DispatcherDashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<OrderCategoryTab>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [trips, setTrips] = useState<DashboardTrip[]>([]);
  const [deferralCount, setDeferralCount] = useState(0);
  const [exceptionCount, setExceptionCount] = useState(0);
  const operationalDate = useOperationalDate();
  const planningDate = operationalDate.selected;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [planningError, setPlanningError] = useState<string | null>(null);
  const [runningPlan, setRunningPlan] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const ordersResponse = await fetch("/api/orders", { cache: "no-store" });
        const ordersPayload: unknown = await ordersResponse.json().catch(() => null);
        if (!ordersResponse.ok) {
          throw new Error("Orders could not be loaded.");
        }
        const read = readOrders(ordersPayload);
        const date = operationalDate.selected;
        const [planningResult, exceptionsResult] = await Promise.all([
          date === null
            ? Promise.resolve({ trips: [] as DashboardTrip[], deferralCount: 0, operationalDate: null, failed: false })
            : fetch(`/api/planning/${encodeURIComponent(date)}`, { cache: "no-store" }).then(async (response) => {
                const payload: unknown = await response.json().catch(() => null);
                if (!response.ok) return { trips: [] as DashboardTrip[], deferralCount: 0, operationalDate: date, failed: true };
                return { ...readPlanning(payload), failed: false };
              }),
          fetch("/api/exceptions", { cache: "no-store" }).then(async (response) => {
            const payload: unknown = await response.json().catch(() => null);
            return response.ok && Array.isArray(payload) ? payload.length : 0;
          }),
        ]);
        if (cancelled) return;
        setOrders(read.orders);
        setTrips(planningResult.trips);
        setDeferralCount(planningResult.deferralCount);
        setExceptionCount(exceptionsResult);
        setLoadError(
          operationalDate.status === "empty"
            ? noOperationalDateMessage
            : date === null
              ? selectOperationalDateMessage
              : planningResult.failed
                ? "Planning result could not be loaded for this operational date."
                : null,
        );
      } catch {
        if (!cancelled) {
          setOrders([]);
          setTrips([]);
          setDeferralCount(0);
          setExceptionCount(0);
          setLoadError("Dashboard data could not be loaded. No substitute figures are shown.");
        }
      }
    }
    if (operationalDate.status === "loading") return () => {
      cancelled = true;
    };
    if (operationalDate.status === "error") {
      setLoadError("Dashboard data could not be loaded. No substitute figures are shown.");
      return () => {
        cancelled = true;
      };
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [operationalDate.selected, operationalDate.status]);

  const categoryCounts = countOrdersByCategory(orders);
  const visibleOrders = filterOrders(orders, activeTab, searchQuery);
  const kpis = dashboardKpis({ orders, trips, deferralCount, exceptionCount });
  const alerts = dashboardAlerts({ deferralCount, exceptionCount });
  const summary = planningSummary({ trips, deferralCount });

  async function runPlanning() {
    if (planningDate === null || runningPlan) return;
    setRunningPlan(true);
    setPlanningError(null);
    try {
      let csrfToken = "";
      const csrfResponse = await fetch("/api/auth/csrf");
      if (csrfResponse.ok) {
        const csrfData = (await csrfResponse.json()) as { csrfToken?: string };
        csrfToken = csrfData.csrfToken ?? "";
      }
      const response = await fetch("/api/planning/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-wayloom-csrf": csrfToken } : {}),
        },
        body: JSON.stringify({ operationalDate: planningDate }),
      });
      if (!response.ok) {
        setPlanningError("Planning did not run. The existing feasibility check did not return a result.");
        return;
      }
      router.push("/dispatcher/planning");
    } catch {
      setPlanningError("Planning could not be reached.");
    } finally {
      setRunningPlan(false);
    }
  }

  return (
    <div className="dashboard-container">
      {loadError && (
        <div className="dashboard-error" role="alert">
          <span>{loadError}</span>
        </div>
      )}

      <section className="dashboard-kpi-grid" aria-label="Key Performance Indicators">
        {kpis.map((kpi) => (
          <div key={kpi.id} className="kpi-card">
            <div className="kpi-card-top">
              <span className="kpi-icon-box" aria-hidden="true">
                {kpiIcon(kpi.id)}
              </span>
            </div>
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value">{kpi.value}</div>
            <div className="kpi-subtitle">{kpi.subtitle}</div>
          </div>
        ))}
      </section>

      <section className="dashboard-alert-strip" role="region" aria-label="Operational Alerts">
        <span className="alert-strip-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </span>
        <div className="alert-strip-items">
          {alerts.map((alert, index) => (
            <span key={alert.text} className="alert-strip-segment">
              {alert.text}
              {index < alerts.length - 1 && <span className="alert-strip-divider" aria-hidden="true">|</span>}
            </span>
          ))}
        </div>
      </section>

      <section className="dashboard-middle-grid" aria-label="Orders and Planning Assistant">
        <div className="dashboard-card orders-card">
          <div className="orders-card-header">
            <div className="order-filter-tabs" role="tablist" aria-label="Order category filter">
              {(["All", "Fresh", "Style", "Tech", "High Risk"] as const).map((tab) => {
                const unsupported = tab === unsupportedCategoryTab;
                const label = tab === "All" ? `All Orders (${categoryCounts.All})` : `${tab} (${categoryCounts[tab]})`;
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-disabled={unsupported}
                    disabled={unsupported}
                    title={unsupported ? "Order priority is not provided by the order API" : undefined}
                    className={`order-tab-btn ${isActive ? "active" : ""}`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="orders-search-box">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search orders..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                aria-label="Filter orders by search"
              />
            </div>
          </div>

          <div className="orders-table-wrapper">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Outlet</th>
                  <th>Brand</th>
                  <th>Items</th>
                  <th>Weight(kg)</th>
                  <th>Delivery Window</th>
                  <th>Priority</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="cell-id">{order.orderId}</td>
                    <td className="cell-outlet">{order.outlet}</td>
                    <td className="cell-category">{order.brand}</td>
                    <td>{order.items}</td>
                    <td>{order.weightKg}</td>
                    <td>{order.deliveryWindow}</td>
                    <td>{order.priority}</td>
                    <td>
                      <span className="badge-status-pending">{order.status}</span>
                    </td>
                  </tr>
                ))}
                {visibleOrders.length === 0 && (
                  <tr>
                    <td colSpan={8} className="empty-table-cell">
                      No orders match the current filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="dashboard-card ai-assistant-card">
          <h2 className="ai-assistant-title">Planning</h2>

          <div className="ai-tabs" role="tablist">
            <button type="button" role="tab" aria-selected="true" className="ai-tab-btn active">
              Quick Plan
            </button>
            <button type="button" role="tab" aria-selected="false" aria-disabled="true" disabled className="ai-tab-btn" title="No approved chat capability">
              Chat unavailable
            </button>
          </div>

          <div className="ai-section-heading">Planning scope</div>
          <p className="kpi-subtitle">No optimization objective is approved. This runs the existing feasibility check only.</p>

          <div className="ai-section-heading">Operational date</div>
          <div className="ai-date-picker">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span>{planningDate ?? "No order date loaded"}</span>
          </div>

          {planningError && (
            <p className="kpi-subtitle" role="alert">{planningError}</p>
          )}

          <button type="button" className="ai-generate-btn" onClick={() => void runPlanning()} disabled={planningDate === null || runningPlan}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span>{runningPlan ? "Running planning..." : "Run planning"}</span>
          </button>
        </div>
      </section>

      <section className="dashboard-bottom-grid" aria-label="Routes, Vehicle Status, and Plan Summary">
        <div className="dashboard-card routes-map-card">
          <h3 className="bottom-card-title">Vehicle Routes (Planned)</h3>
          {trips.length === 0 ? (
            <p className="kpi-subtitle">No planned trips for this date. Route geometry is not provided.</p>
          ) : (
            <ul className="vehicle-status-list">
              {trips.map((trip) => (
                <li key={trip.id} className="vehicle-row">
                  <span className="vehicle-id">{trip.vehicleId}</span>
                  <span className="vehicle-type">Trip {trip.tripNumber}</span>
                  <span className="vehicle-type">{trip.depot}</span>
                  <span className="vehicle-badge">{trip.status}</span>
                  <span className="vehicle-percent">{trip.stopCount} stops</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/dispatcher/routes" className="card-link-action">Routes</Link>
        </div>

        <div className="dashboard-card vehicle-status-card">
          <div className="card-header-row">
            <h3 className="bottom-card-title">Vehicle Status</h3>
            <Link href="/dispatcher/routes" className="card-link-action">View All</Link>
          </div>
          <p className="kpi-subtitle">Vehicle availability, maintenance, and utilization are not exposed by the current API.</p>
        </div>

        <div className="dashboard-card ai-summary-card">
          <h3 className="bottom-card-title">Planning result</h3>
          <div className="ai-summary-tiles">
            <div className="summary-tile">
              <div className="summary-tile-value">{summary.vehiclesOnPlan}</div>
              <div className="summary-tile-label">Vehicles on plan</div>
            </div>
            <div className="summary-tile">
              <div className="summary-tile-value">{summary.ordersDeferred}</div>
              <div className="summary-tile-label">Orders deferred</div>
            </div>
            <div className="summary-tile">
              <div className="summary-tile-value">{summary.estimatedOnTime}</div>
              <div className="summary-tile-label">Estimated on-time</div>
            </div>
            <div className="summary-tile">
              <div className="summary-tile-value">{summary.fuelReduction}</div>
              <div className="summary-tile-label">Fuel reduction</div>
            </div>
          </div>
          <p className="kpi-subtitle">On-time and fuel-reduction figures are not in the planning result.</p>
          <Link href="/dispatcher/planning" className="view-full-plan-btn">
            View planning result →
          </Link>
        </div>
      </section>
    </div>
  );
}

function kpiIcon(id: string) {
  switch (id) {
    case "orders":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      );
    case "items":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
          <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
        </svg>
      );
    case "vehicles":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="3" width="15" height="13" />
          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
      );
    case "target":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      );
    case "risk":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    default:
      return null;
  }
}
