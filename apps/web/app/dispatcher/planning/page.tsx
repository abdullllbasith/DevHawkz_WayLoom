"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  confirmPlanOnServer,
} from "../../../lib/dispatcher-confirmation";
import {
  defaultAiReasoningInsights,
  defaultDeferredOrders,
  defaultPlanConstraints,
  defaultPlanVsPrevious,
  defaultPlanningKpis,
  defaultRouteOverview,
  defaultVehicleAssignments,
  defaultVehicleExplanation,
  filterVehicles,
  type PlanningTab,
  type VehicleAssignment,
  type VehicleCategoryTab,
} from "../../../lib/dispatcher-planning";
import { ApprovedPlanView } from "../allocation-confirmation/approved-plan-view";

export default function DispatcherPlanningPage() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<PlanningTab>("vehicles");
  const [vehicleCategory, setVehicleCategory] = useState<VehicleCategoryTab>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleAssignment | null>(null);
  const [vehicles, setVehicles] = useState<VehicleAssignment[]>(() => [...defaultVehicleAssignments]);
  const [isApproved, setIsApproved] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [inFlightRun, setInFlightRun] = useState(false);

  const visibleVehicles = filterVehicles(vehicles, vehicleCategory, searchQuery);

  const toggleSelectVehicle = (id: string) => {
    setVehicles((prev) =>
      prev.map((v) => (v.id === id ? { ...v, selected: !v.selected } : v)),
    );
  };

  const toggleSelectAll = () => {
    const allSelected = visibleVehicles.length > 0 && visibleVehicles.every((v) => v.selected);
    const visibleIds = new Set(visibleVehicles.map((v) => v.id));
    setVehicles((prev) =>
      prev.map((v) => (visibleIds.has(v.id) ? { ...v, selected: !allSelected } : v)),
    );
  };

  const handleOpenDrawer = (vehicle: VehicleAssignment) => {
    setSelectedVehicle(vehicle);
    setIsDrawerOpen(true);
  };

  const handleRunPlanning = async () => {
    setInFlightRun(true);
    try {
      await fetch("/api/planning/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationalDate: "2026-06-02" }),
      });
    } catch {
      // API call attempted; fall through gracefully
    } finally {
      setInFlightRun(false);
    }
  };

  const handleApprovePlan = async () => {
    if (isConfirming) return;
    setIsConfirming(true);
    setConfirmError(null);

    try {
      let csrfToken = "";
      try {
        const csrfRes = await fetch("/api/auth/csrf");
        if (csrfRes.ok) {
          const csrfData = (await csrfRes.json()) as { csrfToken?: string };
          csrfToken = csrfData.csrfToken ?? "";
        }
      } catch {
        // Safe fallback if CSRF cannot be loaded
      }

      const result = await confirmPlanOnServer({ csrfToken });
      if (result.ok) {
        setIsApproved(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setConfirmError(result.message);
      }
    } catch {
      setConfirmError("An unexpected error occurred while confirming allocation.");
    } finally {
      setIsConfirming(false);
    }
  };

  if (isApproved) {
    return <ApprovedPlanView />;
  }

  return (
    <div className="planning-page-container">
      {confirmError && (
        <div className="orders-feedback-banner error" role="alert">
          <span>{confirmError}</span>
          <button type="button" onClick={() => setConfirmError(null)} aria-label="Dismiss error">✕</button>
        </div>
      )}

      {/* 2. Top Planning KPI Metrics (6 across) */}
      <section className="planning-kpi-grid" aria-label="Planning Summary Metrics">
        {/* KPI 1: Vehicles Assigned */}
        <div className="kpi-card">
          <div className="kpi-card-top">
            <span className="kpi-icon-box" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="3" width="15" height="13" />
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                <circle cx="5.5" cy="18.5" r="2.5" />
                <circle cx="18.5" cy="18.5" r="2.5" />
              </svg>
            </span>
            <span className="kpi-circular-pill" aria-hidden="true">90%</span>
          </div>
          <div className="kpi-label">Vehicles Assigned</div>
          <div className="kpi-value">
            {defaultPlanningKpis.vehiclesAssigned} <span className="kpi-denom">/ {defaultPlanningKpis.vehiclesTotal}</span>
          </div>
          <div className="kpi-subtitle">2 unassigned (maintenance)</div>
        </div>

        {/* KPI 2: Orders Scheduled */}
        <div className="kpi-card">
          <div className="kpi-card-top">
            <span className="kpi-icon-box" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            </span>
          </div>
          <div className="kpi-label">Orders Scheduled</div>
          <div className="kpi-value">
            {defaultPlanningKpis.ordersScheduled} <span className="kpi-denom">/ {defaultPlanningKpis.ordersTotal}</span>
          </div>
          <div className="kpi-subtitle">3 deferred</div>
        </div>

        {/* KPI 3: Estimated On-time */}
        <div className="kpi-card">
          <div className="kpi-card-top">
            <span className="kpi-icon-box" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </span>
            <span className="kpi-change-badge positive">↑ 11%</span>
          </div>
          <div className="kpi-label">Estimated On-time</div>
          <div className="kpi-value">{defaultPlanningKpis.estimatedOnTime}</div>
          <div className="kpi-subtitle">Target: {defaultPlanningKpis.onTimeTarget}</div>
        </div>

        {/* KPI 4: Estimated Fuel Consumption */}
        <div className="kpi-card">
          <div className="kpi-card-top">
            <span className="kpi-icon-box" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 22h12V4H3z" />
                <path d="M15 10l4-2v8l-4 2" />
                <circle cx="9" cy="10" r="2" />
              </svg>
            </span>
            <span className="kpi-change-badge positive">↓ 11%</span>
          </div>
          <div className="kpi-label">Estimated Fuel Consumption</div>
          <div className="kpi-value">
            {defaultPlanningKpis.estimatedFuelConsumptionL} <span className="kpi-denom">L</span>
          </div>
          <div className="kpi-subtitle">vs. previous plan</div>
        </div>

        {/* KPI 5: CO2 Reduction */}
        <div className="kpi-card">
          <div className="kpi-card-top">
            <span className="kpi-icon-box" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            </span>
          </div>
          <div className="kpi-label">CO₂ Reduction</div>
          <div className="kpi-value">{defaultPlanningKpis.co2Reduction}</div>
          <div className="kpi-subtitle">~ 420 kg less</div>
        </div>

        {/* KPI 6: Constraint Violations */}
        <div className="kpi-card">
          <div className="kpi-card-top">
            <span className="kpi-icon-box" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </span>
          </div>
          <div className="kpi-label">Constraint Violations</div>
          <div className="kpi-value">{defaultPlanningKpis.constraintViolations}</div>
          <div className="kpi-subtitle">All rules satisfied</div>
        </div>
      </section>

      {/* 3. Section Navigation Tabs & Action Bar */}
      <section className="planning-tab-bar" aria-label="Planning views">
        <div className="tab-pill-group" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "vehicles"}
            className={`planning-tab-btn ${activeTab === "vehicles" ? "active" : ""}`}
            onClick={() => setActiveTab("vehicles")}
          >
            Vehicle Assignments
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "route-plan"}
            className={`planning-tab-btn ${activeTab === "route-plan" ? "active" : ""}`}
            onClick={() => setActiveTab("route-plan")}
          >
            Route Plan
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "unassigned"}
            className={`planning-tab-btn ${activeTab === "unassigned" ? "active" : ""}`}
            onClick={() => setActiveTab("unassigned")}
          >
            Unassigned Orders (3)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "comparison"}
            className={`planning-tab-btn ${activeTab === "comparison" ? "active" : ""}`}
            onClick={() => setActiveTab("comparison")}
          >
            Plan Comparison
          </button>
        </div>

        <div className="planning-right-actions">
          <button type="button" className="edit-plan-btn" aria-label="Edit plan">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <span>Edit Plan</span>
          </button>
          <button type="button" className="more-options-btn" aria-label="More planning actions">
            ⋮
          </button>
        </div>
      </section>

      {/* 4. Middle Grid: Left Table Card (60%) + Right Overview Card (40%) */}
      <section className="planning-middle-grid" aria-label="Vehicle assignments and route preview">
        {/* Left Column: Vehicle Assignments Table */}
        <div className="dashboard-card planning-table-card">
          <div className="planning-table-header">
            <div className="sub-filter-pills" role="tablist">
              {(["All", "Reefer", "Van", "Truck"] as const).map((type) => {
                const count =
                  type === "All"
                    ? vehicles.length
                    : vehicles.filter((v) => v.type === type).length;
                const label = `${type === "All" ? "All Vehicles" : type} (${count})`;
                const isActive = vehicleCategory === type;
                return (
                  <button
                    key={type}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`sub-pill-btn ${isActive ? "active" : ""}`}
                    onClick={() => setVehicleCategory(type)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="table-search-and-filter">
              <div className="planning-search-box">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Search vehicle or route..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Filter vehicles table"
                />
              </div>

              <button type="button" className="filter-pill-btn" aria-label="Filter options">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                <span>Filter</span>
              </button>
            </div>
          </div>

          <div className="planning-table-wrapper">
            <table className="planning-table">
              <thead>
                <tr>
                  <th style={{ width: "32px" }}>
                    <input
                      type="checkbox"
                      aria-label="Select all vehicles"
                      checked={visibleVehicles.length > 0 && visibleVehicles.every((v) => v.selected)}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th>Vehicle ID</th>
                  <th>Type</th>
                  <th>Driver</th>
                  <th>Trip Usage<br /><span className="th-sub">(Max 2/day)</span></th>
                  <th>Orders</th>
                  <th>Load (kg)</th>
                  <th>Load %</th>
                  <th>Route</th>
                  <th>Status</th>
                  <th style={{ textAlign: "center" }}>View Route</th>
                </tr>
              </thead>
              <tbody>
                {visibleVehicles.map((vehicle) => (
                  <tr key={vehicle.id} className={vehicle.selected ? "row-selected" : ""}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select vehicle ${vehicle.vehicleId}`}
                        checked={vehicle.selected ?? false}
                        onChange={() => toggleSelectVehicle(vehicle.id)}
                      />
                    </td>
                    <td className="cell-veh-id">
                      <button
                        type="button"
                        className="veh-id-btn"
                        onClick={() => handleOpenDrawer(vehicle)}
                        title="View AI Explanation drawer"
                      >
                        {vehicle.vehicleId}
                      </button>
                    </td>
                    <td className="cell-type">{vehicle.type}</td>
                    <td className="cell-driver">
                      <span className={`driver-status-dot ${vehicle.driverOnline ? "online" : "offline"}`} aria-hidden="true" />
                      <span>{vehicle.driver}</span>
                    </td>
                    <td className={`cell-trip-usage ${vehicle.currentTrips === vehicle.maxTrips ? "usage-max" : ""}`}>
                      {vehicle.tripUsage}
                    </td>
                    <td>{vehicle.ordersCount}</td>
                    <td className={vehicle.loadPercent === 100 ? "load-full-highlight" : ""}>
                      {vehicle.currentLoadKg.toLocaleString()} / {vehicle.capacityKg.toLocaleString()}
                    </td>
                    <td>
                      <span className="load-percent-val">{vehicle.loadPercent}%</span>
                    </td>
                    <td>
                      <span className="route-badge-pill">{vehicle.routeId}</span>
                    </td>
                    <td>
                      <span className="badge-assigned-status">{vehicle.status}</span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button
                        type="button"
                        className="view-route-dots-btn"
                        onClick={() => handleOpenDrawer(vehicle)}
                        aria-label={`View route for ${vehicle.vehicleId}`}
                      >
                        ⋮
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Route Overview Map & Turn-by-Turn Card */}
        <div className="dashboard-card planning-route-card">
          <div className="card-header-row">
            <h3 className="route-card-title">
              <span className="route-overview-icon" aria-hidden="true">🗺</span> Route Overview
            </h3>
            <select className="route-select-dropdown" aria-label="Select route overview">
              <option value="VEH001 - Route 1">VEH001 - Route 1</option>
              <option value="VEH002 - Route 2">VEH002 - Route 2</option>
              <option value="VEH003 - Route 3">VEH003 - Route 3</option>
            </select>
          </div>

          {/* Interactive Route Map Preview */}
          <div className="route-map-preview-container" aria-label="Route map diagram">
            <svg className="route-svg-map" viewBox="0 0 380 160" fill="none" aria-hidden="true">
              <rect width="380" height="160" fill="#F8FAFC" />
              {/* Background grid */}
              <line x1="0" y1="40" x2="380" y2="40" stroke="#F1F5F9" strokeWidth="1.5" />
              <line x1="0" y1="80" x2="380" y2="80" stroke="#F1F5F9" strokeWidth="1.5" />
              <line x1="0" y1="120" x2="380" y2="120" stroke="#F1F5F9" strokeWidth="1.5" />
              <line x1="100" y1="0" x2="100" y2="160" stroke="#F1F5F9" strokeWidth="1.5" />
              <line x1="200" y1="0" x2="200" y2="160" stroke="#F1F5F9" strokeWidth="1.5" />
              <line x1="300" y1="0" x2="300" y2="160" stroke="#F1F5F9" strokeWidth="1.5" />

              {/* Waypoints line */}
              <polyline
                points="30,70 90,110 135,125 180,95 200,80 235,98 290,120 320,110"
                stroke="#64748B"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Depot */}
              <rect x="22" y="62" width="16" height="16" rx="3" fill="#0F172A" />
              <path d="M26 67 H34 V73 H26 Z" fill="#FFFFFF" />

              {/* Stop 1 */}
              <circle cx="90" cy="110" r="7" fill="#1E293B" />
              <text x="90" y="113" fill="#FFFFFF" fontSize="8" fontWeight="700" textAnchor="middle">1</text>

              {/* Stop 2 */}
              <circle cx="135" cy="125" r="7" fill="#1E293B" />
              <text x="135" y="128" fill="#FFFFFF" fontSize="8" fontWeight="700" textAnchor="middle">2</text>

              {/* Stop 3 */}
              <circle cx="180" cy="95" r="7" fill="#1E293B" />
              <text x="180" y="98" fill="#FFFFFF" fontSize="8" fontWeight="700" textAnchor="middle">3</text>

              {/* Stop 4 */}
              <circle cx="200" cy="80" r="7" fill="#1E293B" />
              <text x="200" y="83" fill="#FFFFFF" fontSize="8" fontWeight="700" textAnchor="middle">4</text>

              {/* Stop 5 */}
              <circle cx="235" cy="98" r="7" fill="#1E293B" />
              <text x="235" y="101" fill="#FFFFFF" fontSize="8" fontWeight="700" textAnchor="middle">5</text>

              {/* Stop 6 */}
              <circle cx="290" cy="120" r="7" fill="#1E293B" />
              <text x="290" y="123" fill="#FFFFFF" fontSize="8" fontWeight="700" textAnchor="middle">6</text>

              {/* Return depot */}
              <rect x="312" y="102" width="16" height="16" rx="3" fill="#0F172A" />
              <path d="M316 107 H324 V113 H316 Z" fill="#FFFFFF" />
            </svg>

            {/* Map Legend */}
            <div className="map-corner-legend">
              <div className="legend-chip"><span className="chip-dot depot" /> Depot</div>
              <div className="legend-chip"><span className="chip-dot outlet" /> Outlet / Stop</div>
              <div className="legend-chip"><span className="chip-dot current" /> Current Vehicle</div>
            </div>

            {/* Map Zoom Controls */}
            <div className="map-zoom-dock">
              <button type="button" aria-label="Zoom in">+</button>
              <button type="button" aria-label="Zoom out">-</button>
              <button type="button" aria-label="Reset target">◎</button>
            </div>
          </div>

          {/* Route Stats Line */}
          <div className="route-stats-strip">
            <h4 className="strip-route-title">VEH001 Route Details</h4>
            <div className="route-metric-pills">
              <div className="metric-pill">
                <span className="pill-icon" aria-hidden="true">↗</span>
                <div>
                  <span className="pill-val">{defaultRouteOverview.totalDistanceKm} km</span>
                  <span className="pill-sub">Total Distance</span>
                </div>
              </div>
              <div className="metric-pill">
                <span className="pill-icon" aria-hidden="true">⏱</span>
                <div>
                  <span className="pill-val">{defaultRouteOverview.estimatedTime}</span>
                  <span className="pill-sub">Estimated Time</span>
                </div>
              </div>
              <div className="metric-pill">
                <span className="pill-icon" aria-hidden="true">📦</span>
                <div>
                  <span className="pill-val">{defaultRouteOverview.ordersCount}</span>
                  <span className="pill-sub">Orders</span>
                </div>
              </div>
              <div className="metric-pill">
                <span className="pill-icon" aria-hidden="true">📍</span>
                <div>
                  <span className="pill-val">{defaultRouteOverview.stopsCount}</span>
                  <span className="pill-sub">Stops</span>
                </div>
              </div>
            </div>
          </div>

          {/* Turn-by-Turn Stops List */}
          <div className="route-stops-timeline">
            {defaultRouteOverview.stops.map((stop) => (
              <div key={stop.sequence} className="stop-timeline-row">
                <div className="stop-badge-circle">{stop.sequence}</div>
                <div className="stop-info-body">
                  <div className="stop-info-title">{stop.name}</div>
                  <div className="stop-info-sub">
                    {stop.isDepot ? (
                      <span>{stop.window}</span>
                    ) : (
                      <>
                        <span>{stop.items} items</span>
                        <span className="sep">•</span>
                        <span>{stop.weightKg} kg</span>
                        <span className="sep">•</span>
                        <span>{stop.window}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="stop-time-distance">{stop.timeOffset}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Bottom Row (4 Cards across) */}
      <section className="planning-bottom-grid" aria-label="Deferred orders and reasoning insights">
        {/* Card 1: Deferred Orders (3) */}
        <div className="dashboard-card deferred-orders-card">
          <div className="card-header-row">
            <h3 className="bottom-card-title">Deferred Orders (3)</h3>
            <Link href="/dispatcher/orders" className="card-link-action">View All →</Link>
          </div>
          <div className="deferred-table-wrapper">
            <table className="deferred-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Outlet</th>
                  <th>Category</th>
                  <th>Reason for Deferral</th>
                  <th>Priority</th>
                  <th>Suggested Action</th>
                </tr>
              </thead>
              <tbody>
                {defaultDeferredOrders.map((d) => (
                  <tr key={d.id}>
                    <td className="cell-id">{d.orderId}</td>
                    <td className="cell-outlet">{d.outlet}</td>
                    <td className="cell-category">{d.category}</td>
                    <td className="cell-reason">{d.reasonForDeferral}</td>
                    <td>
                      <span className={`badge-priority badge-${d.priority.toLowerCase()}`}>
                        {d.priority}
                      </span>
                    </td>
                    <td className="cell-action">{d.suggestedAction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Card 2: Plan Constraints Check */}
        <div className="dashboard-card constraints-check-card">
          <h3 className="bottom-card-title">Plan Constraints Check</h3>
          <ul className="constraints-list">
            {defaultPlanConstraints.map((c, i) => (
              <li key={i} className="constraint-item">
                <span className="check-icon" aria-hidden="true">✔</span>
                <span>{c.text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Card 3: Plan vs Previous */}
        <div className="dashboard-card plan-vs-card">
          <div className="card-header-row">
            <h3 className="bottom-card-title">Plan vs Previous</h3>
            <span className="card-link-action">View Details →</span>
          </div>
          <div className="plan-vs-metrics">
            <div className="vs-metric-row">
              <span className="vs-metric-name">Total Distance</span>
              <span className="vs-metric-val">{defaultPlanVsPrevious.totalDistance}</span>
              <span className="vs-metric-delta positive">{defaultPlanVsPrevious.distanceChange}</span>
            </div>
            <div className="vs-metric-row">
              <span className="vs-metric-name">Estimated Time</span>
              <span className="vs-metric-val">{defaultPlanVsPrevious.estimatedTime}</span>
              <span className="vs-metric-delta positive">{defaultPlanVsPrevious.timeChange}</span>
            </div>
            <div className="vs-metric-row">
              <span className="vs-metric-name">Fuel Consumption</span>
              <span className="vs-metric-val">{defaultPlanVsPrevious.fuelConsumption}</span>
              <span className="vs-metric-delta positive">{defaultPlanVsPrevious.fuelChange}</span>
            </div>
            <div className="vs-metric-row">
              <span className="vs-metric-name">On-time Delivery</span>
              <span className="vs-metric-val">{defaultPlanVsPrevious.onTimeDelivery}</span>
              <span className="vs-metric-delta positive">{defaultPlanVsPrevious.onTimeChange}</span>
            </div>
          </div>
        </div>

        {/* Card 4: AI Reasoning & Insights */}
        <div className="dashboard-card ai-reasoning-card">
          <h3 className="bottom-card-title">AI Reasoning &amp; Insights</h3>
          <ul className="reasoning-list">
            {defaultAiReasoningInsights.map((text, i) => (
              <li key={i} className="reasoning-item">
                <span className="check-icon" aria-hidden="true">✔</span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 6. Sticky Bottom Action Bar */}
      <footer className="planning-footer-bar">
        <button
          type="button"
          className="btn-back-to-orders"
          onClick={() => router.push("/dispatcher/orders")}
        >
          ← Back to Orders
        </button>

        <div className="footer-right-buttons">
          <button
            type="button"
            className="btn-regenerate-plan"
            onClick={handleRunPlanning}
            disabled={inFlightRun}
          >
            <span aria-hidden="true">⟳</span>
            <span>{inFlightRun ? "Generating Plan..." : "Regenerate Plan"}</span>
          </button>

          <button
            type="button"
            className="btn-approve-plan"
            onClick={handleApprovePlan}
            disabled={isConfirming}
          >
            <span aria-hidden="true">✔</span>
            <span>{isConfirming ? "Confirming allocation..." : "Approve Plan & Send to Loader →"}</span>
          </button>
        </div>
      </footer>

      {/* 7. Slide-Out Drawer: AI Explanation / Why Selected */}
      {isDrawerOpen && selectedVehicle && (
        <div className="drawer-overlay" onClick={() => setIsDrawerOpen(false)}>
          <aside
            className="slide-out-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="drawer-header">
              <div>
                <h2 id="drawer-title" className="drawer-title">AI Explanation</h2>
                <p className="drawer-subtitle">Why {selectedVehicle.vehicleId} was selected for this route</p>
              </div>
              <button
                type="button"
                className="drawer-close-btn"
                onClick={() => setIsDrawerOpen(false)}
                aria-label="Close explanation drawer"
              >
                ✕
              </button>
            </div>

            {/* Vehicle Profile Strip */}
            <div className="drawer-profile-strip">
              <div className="profile-left">
                <div className="drawer-vehicle-icon-box" aria-hidden="true">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="3" width="15" height="13" />
                    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                    <circle cx="5.5" cy="18.5" r="2.5" />
                    <circle cx="18.5" cy="18.5" r="2.5" />
                  </svg>
                </div>
                <div>
                  <div className="profile-title-row">
                    <span className="profile-veh-id">{selectedVehicle.vehicleId}</span>
                    <span className="badge-reefer-pill">{selectedVehicle.type}</span>
                  </div>
                  <div className="profile-driver-row">
                    <span className="driver-status-dot online" aria-hidden="true" />
                    <span>Driver: {selectedVehicle.driver}</span>
                  </div>
                </div>
              </div>

              <div className="profile-right">
                <span className="profile-usage-label">TRIP USAGE</span>
                <span className="profile-usage-val">1 <span className="usage-denom">/ 2</span></span>
                <span className="profile-usage-sub">One more trip available</span>
              </div>
            </div>

            {/* Drawer Tabs */}
            <div className="drawer-tab-row" role="tablist">
              <button type="button" className="drawer-tab active">Overview</button>
              <button type="button" className="drawer-tab">Assigned Orders (8)</button>
              <button type="button" className="drawer-tab">Route Details</button>
              <button type="button" className="drawer-tab">Comparison</button>
            </div>

            {/* Match Score Card */}
            <div className="match-score-card">
              <div className="match-score-left">
                <div className="match-check-circle" aria-hidden="true">✔</div>
                <div>
                  <h3 className="match-score-headline">Best match for this route</h3>
                  <p className="match-score-desc">
                    {defaultVehicleExplanation.matchHeadline}
                  </p>
                </div>
              </div>
              <div className="match-score-right">
                <span className="match-score-label">Match Score</span>
                <span className="match-score-val">{defaultVehicleExplanation.matchScore}%</span>
              </div>
            </div>

            {/* Key Selection Reasons vs Vehicle Details (2-col) */}
            <div className="drawer-reasons-grid">
              {/* Left Column: Key Selection Reasons */}
              <div className="reasons-column">
                <h3 className="column-title">Key Selection Reasons</h3>
                <div className="reason-cards-list">
                  {defaultVehicleExplanation.keyReasons.map((reason, i) => (
                    <div key={i} className="selection-reason-card">
                      <div className="reason-icon-circle" aria-hidden="true">
                        {renderReasonIcon(reason.icon)}
                      </div>
                      <div className="reason-text-block">
                        <div className="reason-title">{reason.title}</div>
                        <div className="reason-desc">{reason.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: Vehicle Details */}
              <div className="details-column">
                <h3 className="column-title">Vehicle Details</h3>
                <div className="vehicle-detail-sheet">
                  <div className="sheet-row">
                    <span className="sheet-label">Vehicle ID</span>
                    <span className="sheet-val">{selectedVehicle.vehicleId}</span>
                  </div>
                  <div className="sheet-row">
                    <span className="sheet-label">Type</span>
                    <span className="sheet-val">{selectedVehicle.type}</span>
                  </div>
                  <div className="sheet-row">
                    <span className="sheet-label">Driver</span>
                    <span className="sheet-val driver-online-val">
                      <span className="driver-status-dot online" /> {selectedVehicle.driver}
                    </span>
                  </div>
                  <div className="sheet-row">
                    <span className="sheet-label">Capacity</span>
                    <span className="sheet-val">{selectedVehicle.capacityKg.toLocaleString()} kg</span>
                  </div>
                  <div className="sheet-row">
                    <span className="sheet-label">Current Load</span>
                    <span className="sheet-val">{selectedVehicle.currentLoadKg.toLocaleString()} kg ({selectedVehicle.loadPercent}%)</span>
                  </div>

                  {/* Progress bar */}
                  <div className="drawer-load-track">
                    <div className="drawer-load-bar" style={{ width: `${selectedVehicle.loadPercent}%` }} />
                  </div>

                  <div className="sheet-row">
                    <span className="sheet-label">Remaining Capacity</span>
                    <span className="sheet-val">{selectedVehicle.capacityKg - selectedVehicle.currentLoadKg} kg</span>
                  </div>
                  <div className="sheet-row">
                    <span className="sheet-label">Trip Usage (Max 2/day)</span>
                    <span className="sheet-usage-pill">1 / 2</span>
                  </div>
                  <div className="sheet-row">
                    <span className="sheet-label">Current Location</span>
                    <span className="sheet-val">Depot (4.2 km)</span>
                  </div>
                  <div className="sheet-row">
                    <span className="sheet-label">Status</span>
                    <span className="badge-available-pill">Available</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom 2 Cards in Drawer: Route Impact & Assigned Orders Summary */}
            <div className="drawer-bottom-cards">
              <div className="summary-card">
                <h4 className="summary-title">Route Impact</h4>
                <div className="impact-grid">
                  <div className="impact-item">
                    <span className="impact-label">Total Distance</span>
                    <span className="impact-val">68 km</span>
                    <span className="impact-delta">↓ 14% vs. previous</span>
                  </div>
                  <div className="impact-item">
                    <span className="impact-label">Estimated Time</span>
                    <span className="impact-val">5h 30m</span>
                    <span className="impact-delta">↓ 16% vs. previous</span>
                  </div>
                  <div className="impact-item">
                    <span className="impact-label">Estimated Fuel</span>
                    <span className="impact-val">210 L</span>
                    <span className="impact-delta">↓ 12% vs. previous</span>
                  </div>
                </div>
              </div>

              <div className="summary-card">
                <h4 className="summary-title">Assigned Orders Summary</h4>
                <div className="assigned-summary-rows">
                  <div className="summary-row">
                    <span className="summary-label">Total Orders</span>
                    <span className="summary-val">8</span>
                  </div>
                  <div className="summary-row">
                    <span className="summary-label">Total Weight</span>
                    <span className="summary-val">1,240 kg</span>
                  </div>
                  <div className="summary-row">
                    <span className="summary-label">Main Items</span>
                    <span className="summary-val">Fresh Products</span>
                  </div>
                  <div className="summary-row">
                    <span className="summary-label">Delivery Window</span>
                    <span className="summary-val">6:00 AM – 12:00 PM</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="drawer-footer">
              <button
                type="button"
                className="btn-back-to-results"
                onClick={() => setIsDrawerOpen(false)}
              >
                ← Back to Results
              </button>
              <button
                type="button"
                className="btn-view-map-full"
                onClick={() => setIsDrawerOpen(false)}
              >
                <span aria-hidden="true">🗺</span> View Full Route on Map →
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function renderReasonIcon(icon: string) {
  switch (icon) {
    case "location":
      return "📍";
    case "product":
      return "❄️";
    case "capacity":
      return "📦";
    case "trips":
      return "⟳";
    case "window":
      return "⏱";
    case "fuel":
      return "📈";
    default:
      return "✔";
  }
}
