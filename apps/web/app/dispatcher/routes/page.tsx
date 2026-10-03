"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { latestOrderDate, readOrderList, type DispatcherOrder } from "../../../lib/dispatcher-orders";
import { readPlanningResult, type PlanningView } from "../../../lib/dispatcher-planning";
import {
  displayRouteId,
  exportRoutesCsv,
  filterRoutes,
  routeColor,
  routesKpis,
  type RouteStatusTab,
} from "../../../lib/dispatcher-routes";

export default function DispatcherRoutesPage() {
  const [view, setView] = useState<PlanningView>({ operationalDate: null, trips: [], deferrals: [] });
  const [orders, setOrders] = useState<DispatcherOrder[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<RouteStatusTab>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const ordersResponse = await fetch("/api/orders", { cache: "no-store" });
        const ordersPayload: unknown = await ordersResponse.json().catch(() => null);
        if (!ordersResponse.ok) {
          if (!cancelled) {
            setError("Route data could not be loaded.");
            setLoading(false);
          }
          return;
        }

        const loadedOrders = readOrderList(ordersPayload);
        const date = latestOrderDate(loadedOrders);
        let planning: PlanningView = { operationalDate: date, trips: [], deferrals: [] };

        if (date !== null) {
          const planningResponse = await fetch(`/api/planning/${encodeURIComponent(date)}`, { cache: "no-store" });
          const payload: unknown = await planningResponse.json().catch(() => null);
          if (planningResponse.ok) {
            planning = readPlanningResult(payload);
          } else {
            if (!cancelled) setError("Planning result could not be loaded for the current operational date.");
          }
        }

        if (!cancelled) {
          setOrders(loadedOrders);
          setView(planning);
          if (planning.trips.length > 0) {
            setSelectedTripId((prev) => prev ?? planning.trips[0]?.id ?? null);
          }
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("Route information could not be retrieved from the server.");
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const trips = view.trips;
  const kpis = routesKpis(trips);
  const visibleTrips = filterRoutes(trips, { tab: activeTab, query: searchQuery });
  const selectedTrip = trips.find((t) => t.id === selectedTripId) ?? visibleTrips[0] ?? trips[0] ?? null;
  const orderById = new Map(orders.map((o) => [o.id, o]));

  const confirmedCount = trips.filter((t) => t.status === "CONFIRMED").length;
  const plannedCount = trips.filter((t) => t.status === "PLANNED").length;

  function handleExportCsv() {
    if (trips.length === 0) return;
    const csv = exportRoutesCsv(trips);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `wayloom-routes-${view.operationalDate ?? "export"}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="routes-page-container">
      {error && <div className="dashboard-error" role="alert">{error}</div>}

      {/* 1. Top KPI Summary */}
      <section className="routes-kpi-grid" aria-label="Route Performance Metrics">
        {kpis.map((kpi) => (
          <div key={kpi.id} className="kpi-card">
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value">{kpi.value}</div>
            <div className="kpi-subtitle">{kpi.subtitle}</div>
          </div>
        ))}
      </section>

      {/* 2. Action Bar */}
      <section className="routes-action-bar" aria-label="Route Management Actions">
        <div className="routes-action-left">
          <span className="routes-status-badge-black">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Planned Routes
          </span>
          <span className="routes-live-notice">
            <span className="status-dot green" aria-hidden="true" />
            Live vehicle locations &amp; GPS tracking are not available
          </span>
        </div>

        <div className="routes-action-right">
          <button
            type="button"
            className="filter-more-btn"
            disabled
            title="Optimization objective is not approved"
          >
            Re-optimize Routes (AI)
          </button>
          <button
            type="button"
            className="orders-export-btn"
            onClick={handleExportCsv}
            disabled={trips.length === 0}
          >
            Export Route Sheet
          </button>
          <button
            type="button"
            className="filter-more-btn"
            disabled
          >
            Print Driver Manifests
          </button>
        </div>
      </section>

      {/* 3. Main Grid */}
      <section className="routes-main-grid" aria-label="Routes Map and Table">
        {/* Left Column: Map + Table */}
        <div className="routes-left-column">
          {/* Map Card */}
          <div className="dashboard-card routes-map-card">
            {/* Top-left Chips for routes */}
            <div className="routes-map-chips-top">
              {trips.slice(0, 5).map((trip, idx) => {
                const isSelected = trip.id === selectedTrip?.id;
                const color = routeColor(idx);
                return (
                  <button
                    key={trip.id}
                    type="button"
                    className={`routes-map-chip-btn ${isSelected ? "active" : ""}`}
                    onClick={() => setSelectedTripId(trip.id)}
                    aria-label={`Select ${displayRouteId(trip)}`}
                  >
                    <span className="chip-color-dot" style={{ backgroundColor: color }} />
                    <span>{displayRouteId(trip)} - {trip.vehicleId}</span>
                  </button>
                );
              })}
            </div>

            {/* Bottom-left Map Legend */}
            <div className="routes-map-legend-bottom">
              <div className="legend-item-row">
                <span className="chip-dot depot" />
                <span>Depot (Warehouse)</span>
              </div>
              <div className="legend-item-row">
                <span className="chip-dot outlet" />
                <span>Outlet (Stop)</span>
              </div>
              <div className="legend-item-row">
                <span className="chip-dot current" />
                <span>Route Path: —</span>
              </div>
            </div>

            {/* Bottom-right Map Disclaimer */}
            <div className="routes-map-notice-bottom">
              Map geometry, distance, and live GPS are not in the planning result.
            </div>

            {/* Schematic SVG Map */}
            <div className="routes-map-canvas" role="img" aria-label="Schematic Route Overview">
              <svg width="100%" height="100%" viewBox="0 0 700 360" preserveAspectRatio="xMidYMid meet">
                <defs>
                  <linearGradient id="bgWater" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#e0f2fe" />
                    <stop offset="35%" stopColor="#e0f2fe" />
                    <stop offset="36%" stopColor="#f8fafc" />
                    <stop offset="100%" stopColor="#f8fafc" />
                  </linearGradient>
                </defs>
                <rect width="100%" height="100%" fill="url(#bgWater)" />

                {/* Coastline line */}
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
                    {selectedTrip?.depot ?? "Depot"}
                  </text>
                </g>

                {/* Stop Sequence Nodes for Selected Trip */}
                {selectedTrip?.stops.map((stop, sIdx) => {
                  const totalStops = selectedTrip.stops.length;
                  const angle = (sIdx / Math.max(totalStops, 1)) * 2 * Math.PI - Math.PI / 4;
                  const radius = 100 + (sIdx % 2) * 30;
                  const cx = 380 + Math.cos(angle) * radius;
                  const cy = 160 + Math.sin(angle) * radius;
                  const stopOrder = orderById.get(stop.orderId);
                  const color = routeColor(trips.findIndex((t) => t.id === selectedTrip.id));

                  return (
                    <g key={stop.id}>
                      {/* Schematic connection */}
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

          {/* Routes Table Card */}
          <div className="dashboard-card routes-table-card">
            <div className="routes-table-toolbar">
              <div className="routes-tab-pills" role="tablist">
                <button
                  type="button"
                  className={`routes-tab-btn ${activeTab === "All" ? "active" : ""}`}
                  onClick={() => setActiveTab("All")}
                >
                  All Routes ({trips.length})
                </button>
                <button
                  type="button"
                  className={`routes-tab-btn ${activeTab === "Confirmed" ? "active" : ""}`}
                  onClick={() => setActiveTab("Confirmed")}
                >
                  Confirmed ({confirmedCount})
                </button>
                <button
                  type="button"
                  className={`routes-tab-btn ${activeTab === "Planned" ? "active" : ""}`}
                  onClick={() => setActiveTab("Planned")}
                >
                  Planned ({plannedCount})
                </button>
              </div>

              <div className="orders-table-tools">
                <div className="orders-search-box">
                  <svg className="dispatcher-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search routes..."
                    aria-label="Search routes"
                  />
                </div>
              </div>
            </div>

            <div className="orders-table-wrapper">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Route ID</th>
                    <th>Vehicle</th>
                    <th>Driver</th>
                    <th>Stops</th>
                    <th>Distance</th>
                    <th>Est. Time</th>
                    <th>Status</th>
                    <th>Progress</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTrips.map((trip, idx) => {
                    const color = routeColor(idx);
                    const isSelected = trip.id === selectedTrip?.id;
                    return (
                      <tr
                        key={trip.id}
                        onClick={() => setSelectedTripId(trip.id)}
                        style={{ cursor: "pointer", background: isSelected ? "#f8fafc" : undefined }}
                      >
                        <td>
                          <div className="vehicle-id-cell">
                            <span className="chip-color-dot" style={{ backgroundColor: color }} />
                            <span className="vehicle-code-text">{displayRouteId(trip)}</span>
                          </div>
                        </td>
                        <td>
                          <div>
                            <span className="vehicle-code-text">{trip.vehicleId}</span>
                            <div className="type-text">—</div>
                          </div>
                        </td>
                        <td>—</td>
                        <td><span className="orders-count-text">{trip.stops.length}</span></td>
                        <td>—</td>
                        <td>—</td>
                        <td>
                          <span className={trip.status === "CONFIRMED" ? "status-badge-confirmed" : "status-badge-planned"}>
                            {trip.status}
                          </span>
                        </td>
                        <td>—</td>
                        <td>
                          <Link
                            href={`/dispatcher/routes/${encodeURIComponent(trip.id)}`}
                            className="btn-view-route"
                            onClick={(e) => e.stopPropagation()}
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                  {visibleTrips.length === 0 && (
                    <tr>
                      <td colSpan={9} className="empty-table-cell">
                        {loading ? "Loading route information..." : "No routes match the current filter."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Route Details */}
        <div className="dashboard-card routes-details-card">
          <div className="routes-details-header">
            <h2 className="bottom-card-title">Route Details</h2>
            {selectedTrip ? (
              <span className={selectedTrip.status === "CONFIRMED" ? "status-badge-confirmed" : "status-badge-planned"}>
                {selectedTrip.status}
              </span>
            ) : null}
          </div>

          {selectedTrip ? (
            <>
              {/* Vehicle Box */}
              <div className="route-vehicle-box">
                <div className="route-vehicle-meta">
                  <span className="route-vehicle-code">{selectedTrip.vehicleId}</span>
                  <span className="route-vehicle-attr">Driver: —</span>
                  <span className="route-vehicle-attr">Depot: {selectedTrip.depot}</span>
                  <span className="route-vehicle-attr">Trip #{selectedTrip.tripNumber}</span>
                </div>
                <div className="route-temp-badge">
                  <span className="route-temp-val">—</span>
                  <span className="route-temp-lbl">Capacity / Load</span>
                </div>
              </div>

              {/* Route Stops */}
              <div className="route-stops-card-section">
                <div className="route-stops-header">
                  <h3 className="bottom-card-title">Route Stops ({selectedTrip.stops.length})</h3>
                  <span className="type-text">Authoritative sequence</span>
                </div>

                <div className="route-stops-list">
                  <div className="route-stop-item">
                    <div className="route-stop-left">
                      <span className="stop-seq-circle depot">D</span>
                      <div>
                        <div className="stop-outlet-title">{selectedTrip.depot} (Warehouse)</div>
                        <div className="stop-eta-sub">Departure depot</div>
                      </div>
                    </div>
                    <span className="status-badge-confirmed">Depot</span>
                  </div>

                  {selectedTrip.stops.map((stop) => {
                    const order = orderById.get(stop.orderId);
                    return (
                      <div key={stop.id} className="route-stop-item">
                        <div className="route-stop-left">
                          <span className="stop-seq-circle">{stop.sequence}</span>
                          <div>
                            <div className="stop-outlet-title">{order?.outlet ?? stop.orderId}</div>
                            <div className="stop-eta-sub">Planned Arrival: {stop.plannedArrival ?? "—"}</div>
                          </div>
                        </div>
                        <span className="status-badge-planned">Planned</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Route Summary */}
              <div className="route-summary-section">
                <div className="route-summary-header">
                  <h3 className="bottom-card-title">Route Summary</h3>
                  <Link href={`/dispatcher/routes/${encodeURIComponent(selectedTrip.id)}`} className="card-link-action">
                    View Full Route &gt;
                  </Link>
                </div>
                <div className="route-metrics-4col">
                  <div className="route-mini-metric">
                    <span className="mini-metric-lbl">Total Distance</span>
                    <span className="mini-metric-val">—</span>
                  </div>
                  <div className="route-mini-metric">
                    <span className="mini-metric-lbl">Estimated Time</span>
                    <span className="mini-metric-val">—</span>
                  </div>
                  <div className="route-mini-metric">
                    <span className="mini-metric-lbl">Stops</span>
                    <span className="mini-metric-val">{selectedTrip.stops.length} outlets</span>
                  </div>
                  <div className="route-mini-metric">
                    <span className="mini-metric-lbl">Total Weight</span>
                    <span className="mini-metric-val">—</span>
                  </div>
                </div>
              </div>

              {/* AI Planning Insight */}
              <div className="route-ai-insight-box">
                <div className="route-ai-insight-title">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  AI Planning Insight
                </div>
                <p className="route-ai-insight-text">
                  AI route insights and comparison metrics are not in the planning result. The server feasibility result is authoritative.
                </p>
              </div>
            </>
          ) : (
            <p className="kpi-subtitle">No trip selected or available.</p>
          )}
        </div>
      </section>
    </div>
  );
}
