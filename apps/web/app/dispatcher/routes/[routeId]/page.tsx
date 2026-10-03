"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

import { readOrderList, type DispatcherOrder } from "../../../../lib/dispatcher-orders";
import {
  computeTripOrderTotals,
  readTripDetail,
  tripDetailKpis,
  type TripDetail,
} from "../../../../lib/dispatcher-route-details";
import { tripReadyToDispatch } from "../../../../lib/dispatcher-dispatch";
import { displayRouteId, exportRoutesCsv, routeColor } from "../../../../lib/dispatcher-routes";

export default function DispatcherRouteDetailPage({
  params,
}: {
  params: Promise<{ routeId: string }>;
}) {
  const { routeId } = use(params);

  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [orders, setOrders] = useState<DispatcherOrder[]>([]);
  const [exceptionCount, setExceptionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        setNotFound(false);

        const [tripRes, ordersRes, exceptionsRes] = await Promise.all([
          fetch(`/api/trips/${encodeURIComponent(routeId)}`, { cache: "no-store" }),
          fetch("/api/orders", { cache: "no-store" }),
          fetch("/api/exceptions", { cache: "no-store" }),
        ]);

        if (tripRes.status === 404 || tripRes.status === 400) {
          if (!cancelled) {
            setNotFound(true);
            setLoading(false);
          }
          return;
        }

        if (!tripRes.ok) {
          if (!cancelled) {
            setError("Route details could not be loaded from the server.");
            setLoading(false);
          }
          return;
        }

        const tripPayload: unknown = await tripRes.json().catch(() => null);
        const parsedTrip = readTripDetail(tripPayload);

        if (!parsedTrip) {
          if (!cancelled) {
            setError("Invalid route information received from the server.");
            setLoading(false);
          }
          return;
        }

        const ordersPayload: unknown = await ordersRes.json().catch(() => null);
        const parsedOrders = ordersRes.ok ? readOrderList(ordersPayload) : [];

        const exceptionsPayload: unknown = await exceptionsRes.json().catch(() => null);
        const parsedExceptions =
          exceptionsRes.ok && Array.isArray(exceptionsPayload) ? exceptionsPayload.length : 0;

        if (!cancelled) {
          setTrip(parsedTrip);
          setOrders(parsedOrders);
          setExceptionCount(parsedExceptions);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("Route details could not be retrieved due to a network error.");
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [routeId, reloadKey]);

  if (notFound) {
    return (
      <div className="routes-page-container">
        <div className="dashboard-card" style={{ padding: "36px", textAlign: "center" }}>
          <h2 className="bottom-card-title">Route Not Found</h2>
          <p className="kpi-subtitle" style={{ margin: "8px 0 16px 0" }}>
            The requested route/trip identifier &quot;{routeId}&quot; does not exist or has been removed.
          </p>
          <div>
            <Link href="/dispatcher/routes" className="btn-view-route">
              ← Return to Routes Management
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (loading && !trip) {
    return (
      <div className="routes-page-container">
        <div className="dashboard-card" style={{ padding: "36px", textAlign: "center" }}>
          <p className="kpi-subtitle">Loading route details...</p>
        </div>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="routes-page-container">
        {error && <div className="dashboard-error" role="alert">{error}</div>}
        <div className="dashboard-card" style={{ padding: "36px", textAlign: "center" }}>
          <h2 className="bottom-card-title">Unable to Load Route</h2>
          <p className="kpi-subtitle" style={{ margin: "8px 0 16px 0" }}>
            Route information is temporarily unavailable.
          </p>
          <div>
            <Link href="/dispatcher/routes" className="btn-view-route">
              ← Return to Routes Management
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const orderById = new Map(orders.map((o) => [o.id, o]));
  const totals = computeTripOrderTotals(trip.stops, orderById);
  const kpis = tripDetailKpis(trip, totals);
  const routeDisplayId = displayRouteId(trip);

  async function dispatchLoadedTrip() {
    if (trip === null || dispatching) return;
    setDispatching(true);
    setError(null);
    try {
      const tokenResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
      const tokenBody = tokenResponse.ok ? ((await tokenResponse.json()) as { csrfToken?: string }) : {};
      const response = await fetch(`/api/trips/${encodeURIComponent(trip.id)}/dispatch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(tokenBody.csrfToken ? { "x-wayloom-csrf": tokenBody.csrfToken } : {}),
        },
        body: "{}",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: { code?: string } };
        setError(body.error?.code ?? "dispatch_failed");
        return;
      }
      setReloadKey((value) => value + 1);
    } catch {
      setError("dispatch_failed");
    } finally {
      setDispatching(false);
    }
  }

  function handleExportRouteCsv() {
    if (!trip) return;
    const planTrip = {
      id: trip.id,
      vehicleId: trip.vehicleId,
      depot: trip.depot,
      tripNumber: trip.tripNumber,
      status: trip.status,
      routeId: trip.routeId,
      stops: trip.stops.map((s) => ({
        id: s.id,
        orderId: s.orderId,
        sequence: s.sequence,
        plannedArrival: s.plannedArrival,
      })),
    };
    const csv = exportRoutesCsv([planTrip]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `wayloom-route-${routeDisplayId}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="routes-page-container">
      {error && <div className="dashboard-error" role="alert">{error}</div>}

      {/* 1. Header with back navigation & route badge */}
      <div className="routes-details-top-bar">
        <div className="routes-details-title-group">
          <Link href="/dispatcher/routes" className="btn-view-route">
            ← Back to Routes
          </Link>
          <div className="routes-title-wrap">
            <h2 className="routes-details-heading">{routeDisplayId}</h2>
            <span className="routes-details-sub">
              Vehicle {trip.vehicleId} • {trip.depot} Depot • Trip #{trip.tripNumber} • Operational Date {trip.operationalDate}
            </span>
          </div>
        </div>

        <div className="routes-details-badge-group">
          <span className={trip.status === "CONFIRMED" ? "status-badge-confirmed" : "status-badge-planned"}>
            {trip.status}
          </span>
          <button type="button" className="orders-export-btn" onClick={handleExportRouteCsv}>
            Export Route Sheet
          </button>
          {tripReadyToDispatch({
            stops: trip.stops,
            orderStatus: (orderId) => orders.find((order) => order.id === orderId)?.status,
          }) ? (
            <button type="button" className="orders-export-btn" disabled={dispatching} onClick={() => void dispatchLoadedTrip()}>
              {dispatching ? "Dispatching" : "Dispatch trip"}
            </button>
          ) : null}
        </div>
      </div>

      {/* 2. Top KPI Summary */}
      <section className="routes-kpi-grid" aria-label="Route Performance Metrics">
        {kpis.map((kpi) => (
          <div key={kpi.id} className="kpi-card">
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value">{kpi.value}</div>
            <div className="kpi-subtitle">{kpi.subtitle}</div>
          </div>
        ))}
      </section>

      {/* 3. Main Grid */}
      <section className="routes-main-grid" aria-label="Route Detail Overview and Assignment">
        {/* Left Column: Schematic Map + Stop Sequence Table */}
        <div className="routes-left-column">
          {/* Schematic Route Map Card */}
          <div className="dashboard-card routes-map-card">
            <div className="routes-map-chips-top">
              <div className="routes-map-chip-btn active">
                <span className="chip-color-dot" style={{ backgroundColor: routeColor(0) }} />
                <span>{routeDisplayId} - {trip.vehicleId}</span>
              </div>
            </div>

            <div className="routes-map-legend-bottom">
              <div className="legend-item-row">
                <span className="chip-dot depot" />
                <span>Depot: {trip.depot}</span>
              </div>
              <div className="legend-item-row">
                <span className="chip-dot outlet" />
                <span>Stops: {trip.stops.length} outlets</span>
              </div>
              <div className="legend-item-row">
                <span className="chip-dot current" />
                <span>Sequence: 1 → {trip.stops.length}</span>
              </div>
            </div>

            <div className="routes-map-notice-bottom">
              Map geometry, distance, and live GPS are not in the planning result.
            </div>

            <div className="routes-map-canvas" role="img" aria-label="Schematic Route Overview">
              <svg width="100%" height="100%" viewBox="0 0 700 360" preserveAspectRatio="xMidYMid meet">
                <defs>
                  <linearGradient id="detailWater" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#e0f2fe" />
                    <stop offset="35%" stopColor="#e0f2fe" />
                    <stop offset="36%" stopColor="#f8fafc" />
                    <stop offset="100%" stopColor="#f8fafc" />
                  </linearGradient>
                </defs>
                <rect width="100%" height="100%" fill="url(#detailWater)" />

                <path
                  d="M 240 0 Q 255 120, 245 200 T 260 360"
                  fill="none"
                  stroke="#cbd5e1"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                />

                {/* Depot Node */}
                <g transform="translate(260, 160)">
                  <rect x="-14" y="-14" width="28" height="28" rx="6" fill="#0f172a" />
                  <path d="M-6 4 L0 -6 L6 4 Z" fill="#ffffff" />
                  <text x="18" y="4" fontSize="12" fontWeight="700" fill="#0f172a">
                    {trip.depot}
                  </text>
                </g>

                {/* Stop Sequence Nodes */}
                {trip.stops.map((stop, sIdx) => {
                  const totalStops = trip.stops.length;
                  const angle = (sIdx / Math.max(totalStops, 1)) * 2 * Math.PI - Math.PI / 4;
                  const radius = 100 + (sIdx % 2) * 30;
                  const cx = 380 + Math.cos(angle) * radius;
                  const cy = 160 + Math.sin(angle) * radius;
                  const stopOrder = orderById.get(stop.orderId);
                  const color = routeColor(0);

                  return (
                    <g key={stop.id}>
                      <line
                        x1={sIdx === 0 ? 260 : 380 + Math.cos(((sIdx - 1) / Math.max(totalStops, 1)) * 2 * Math.PI - Math.PI / 4) * (100 + ((sIdx - 1) % 2) * 30)}
                        y1={sIdx === 0 ? 160 : 160 + Math.sin(((sIdx - 1) / Math.max(totalStops, 1)) * 2 * Math.PI - Math.PI / 4) * (100 + ((sIdx - 1) % 2) * 30)}
                        x2={cx}
                        y2={cy}
                        stroke={color}
                        strokeWidth="2.5"
                        strokeDasharray="3 3"
                        opacity="0.85"
                      />
                      <circle cx={cx} cy={cy} r="13" fill={color} />
                      <text x={cx} y={cy + 4} fontSize="11" fontWeight="700" fill="#ffffff" textAnchor="middle">
                        {stop.sequence}
                      </text>
                      <text x={cx} y={cy + 22} fontSize="10" fontWeight="600" fill="#334155" textAnchor="middle">
                        {stopOrder?.outlet ?? stop.orderId}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Ordered Stop Sequence & Assigned Orders Table */}
          <div className="dashboard-card" style={{ padding: "20px" }}>
            <div className="card-header-row">
              <h3 className="bottom-card-title">Stop Sequence ({trip.stops.length})</h3>
              <span className="type-text">Authoritative sequence preserved</span>
            </div>

            <div className="orders-table-wrapper" style={{ marginTop: "12px" }}>
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Seq</th>
                    <th>Stop / Outlet</th>
                    <th>Order ID</th>
                    <th>Brand</th>
                    <th>Temp</th>
                    <th>Units / Weight</th>
                    <th>Planned Arrival</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Depot Origin Row */}
                  <tr style={{ background: "#f8fafc" }}>
                    <td>
                      <span className="stop-seq-circle depot" style={{ margin: "0 auto" }}>D</span>
                    </td>
                    <td>
                      <strong>{trip.depot} (Warehouse)</strong>
                      <div className="type-text">Departure Depot</div>
                    </td>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                    <td><span className="status-badge-confirmed">Depot</span></td>
                  </tr>

                  {/* Stops */}
                  {trip.stops.map((stop) => {
                    const order = orderById.get(stop.orderId);
                    return (
                      <tr key={stop.id}>
                        <td>
                          <span className="stop-seq-circle" style={{ margin: "0 auto" }}>{stop.sequence}</span>
                        </td>
                        <td>
                          <strong>{order?.outlet ?? stop.orderId}</strong>
                          <div className="type-text">{order?.district ?? "—"}</div>
                        </td>
                        <td>{order?.orderId ?? stop.orderId}</td>
                        <td>{order?.brand ?? "—"}</td>
                        <td>
                          <span className={order?.temperature === "chilled" ? "route-badge-pill" : "type-text"}>
                            {order?.temperature ? order.temperature.toUpperCase() : "—"}
                          </span>
                        </td>
                        <td>
                          {order ? `${order.items} items • ${order.weightKg} kg` : "—"}
                        </td>
                        <td>{stop.plannedArrival ?? "—"}</td>
                        <td>
                          <span className={trip.status === "CONFIRMED" ? "status-badge-confirmed" : "status-badge-planned"}>
                            {order?.status ?? trip.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}

                  {trip.stops.length === 0 && (
                    <tr>
                      <td colSpan={8} className="empty-table-cell">
                        No stops assigned to this route.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Vehicle, Exceptions, Lifecycle */}
        <div className="dashboard-card routes-details-card">
          <div className="routes-details-header">
            <h2 className="bottom-card-title">Vehicle &amp; Assignment</h2>
            <span className={trip.status === "CONFIRMED" ? "status-badge-confirmed" : "status-badge-planned"}>
              {trip.status}
            </span>
          </div>

          {/* Vehicle Box */}
          <div className="route-vehicle-box">
            <div className="route-vehicle-meta">
              <span className="route-vehicle-code">{trip.vehicleId}</span>
              <span className="route-vehicle-attr">Driver: —</span>
              <span className="route-vehicle-attr">Depot: {trip.depot}</span>
              <span className="route-vehicle-attr">Trip #{trip.tripNumber}</span>
              <span className="route-vehicle-attr">Operational Date: {trip.operationalDate}</span>
            </div>
            <div className="route-temp-badge">
              <span className="route-temp-val">
                {totals.totalWeightKg > 0 ? `${totals.totalWeightKg} kg` : "—"}
              </span>
              <span className="route-temp-lbl">
                {totals.hasChilled ? "Chilled Requirement" : "Ambient Load"}
              </span>
            </div>
          </div>

          {/* Operational Exceptions Card */}
          <div className="route-stops-card-section">
            <div className="route-stops-header">
              <h3 className="bottom-card-title">Operational Exceptions</h3>
              <Link href="/dispatcher/exceptions" className="card-link-action">
                View Exceptions &gt;
              </Link>
            </div>
            <p className="kpi-subtitle">
              {exceptionCount > 0
                ? `${exceptionCount} open operational exception(s) recorded in the system.`
                : "No operational exceptions reported for this route."}
            </p>
          </div>

          {/* Lifecycle & Operational Status */}
          <div className="route-summary-section">
            <div className="route-summary-header">
              <h3 className="bottom-card-title">Lifecycle &amp; Operational Next Steps</h3>
            </div>
            <div className="next-steps-timeline" style={{ marginTop: "8px" }}>
              <div className="timeline-step-row">
                <span className="step-circle current">1</span>
                <div className="step-content">
                  <span className="step-title">Planning Allocation</span>
                  <p className="step-desc">Deterministic feasibility verified by Phase 5 planning engine.</p>
                </div>
              </div>

              <div className="timeline-step-row">
                <span className={`step-circle ${trip.status === "CONFIRMED" ? "current" : "future"}`}>2</span>
                <div className="step-content">
                  <span className="step-title">Allocation Confirmation</span>
                  <p className="step-desc">
                    {trip.status === "CONFIRMED"
                      ? "Route allocation confirmed by Dispatcher on server."
                      : "Pending Allocation Confirmation before warehouse execution."}
                  </p>
                </div>
              </div>

              <div className="timeline-step-row">
                <span className="step-circle future">3</span>
                <div className="step-content">
                  <span className="step-title">Warehouse Loading</span>
                  <p className="step-desc">Handled by the Loader role after allocation confirmation.</p>
                </div>
              </div>

              <div className="timeline-step-row">
                <span className="step-circle future">4</span>
                <div className="step-content">
                  <span className="step-title">Driver Delivery</span>
                  <p className="step-desc">Executed by the Driver role according to authoritative stop sequence.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
