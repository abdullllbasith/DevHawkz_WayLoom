"use client";

import { useId, useState } from "react";
import Link from "next/link";

import {
  countOrdersByCategory,
  defaultAiSummary,
  defaultAlerts,
  defaultKpis,
  defaultOrders,
  defaultVehicles,
  filterOrders,
  type DashboardOrder,
  type OrderCategoryTab,
} from "../../lib/dispatcher-dashboard";

export default function DispatcherDashboardPage() {
  const [activeTab, setActiveTab] = useState<OrderCategoryTab>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [orders, setOrders] = useState<DashboardOrder[]>(() => [...defaultOrders]);
  const [planningTab, setPlanningTab] = useState<"quick" | "chat">("quick");
  const [selectedObjective, setSelectedObjective] = useState("on-time");
  const baseId = useId();

  const categoryCounts = countOrdersByCategory(orders);
  const visibleOrders = filterOrders(orders, activeTab, searchQuery);

  const toggleSelectOrder = (id: string) => {
    setOrders((prev) =>
      prev.map((order) => (order.id === id ? { ...order, selected: !order.selected } : order)),
    );
  };

  const toggleSelectAll = () => {
    const allSelected = visibleOrders.every((o) => o.selected);
    const visibleIds = new Set(visibleOrders.map((o) => o.id));
    setOrders((prev) =>
      prev.map((order) =>
        visibleIds.has(order.id) ? { ...order, selected: !allSelected } : order,
      ),
    );
  };

  return (
    <div className="dashboard-container">
      {/* 1. Top KPI Summary Cards */}
      <section className="dashboard-kpi-grid" aria-label="Key Performance Indicators">
        {defaultKpis.map((kpi) => (
          <div key={kpi.id} className="kpi-card">
            <div className="kpi-card-top">
              <span className="kpi-icon-box" aria-hidden="true">
                {kpiIcon(kpi.id)}
              </span>
              {kpi.change && (
                <span className={`kpi-change-badge ${kpi.changeType ?? "positive"}`}>
                  {kpi.changeType === "negative" ? "↘" : "↗"} {kpi.change}
                </span>
              )}
            </div>
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value">{kpi.value}</div>
            <div className="kpi-subtitle">{kpi.subtitle}</div>
          </div>
        ))}
      </section>

      {/* 2. Operational Alert Strip */}
      <section className="dashboard-alert-strip" role="region" aria-label="Operational Alerts">
        <span className="alert-strip-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </span>
        <div className="alert-strip-items">
          {defaultAlerts.map((alert, index) => (
            <span key={alert.text} className="alert-strip-segment">
              {alert.text}
              {index < defaultAlerts.length - 1 && <span className="alert-strip-divider" aria-hidden="true">|</span>}
            </span>
          ))}
        </div>
      </section>

      {/* 3. Middle Section: Orders Table + AI Planning Assistant */}
      <section className="dashboard-middle-grid" aria-label="Orders and Planning Assistant">
        {/* Left Column: Orders Section */}
        <div className="dashboard-card orders-card">
          <div className="orders-card-header">
            <div className="order-filter-tabs" role="tablist" aria-label="Order category filter">
              {(["All", "Fresh", "Style", "Tech", "High Risk"] as const).map((tab) => {
                const label = tab === "All" ? `All Orders (${categoryCounts.All})` : `${tab} (${categoryCounts[tab]})`;
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
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
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Filter orders by search"
              />
            </div>
          </div>

          <div className="orders-table-wrapper">
            <table className="orders-table">
              <thead>
                <tr>
                  <th style={{ width: "36px" }}>
                    <input
                      type="checkbox"
                      aria-label="Select all orders"
                      checked={visibleOrders.length > 0 && visibleOrders.every((o) => o.selected)}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th>Order ID</th>
                  <th>Outlet</th>
                  <th>Category</th>
                  <th>Items</th>
                  <th>Weight(kg)</th>
                  <th>Delivery Window</th>
                  <th>Priority</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((order) => (
                  <tr key={order.id} className={order.selected ? "row-selected" : ""}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select order ${order.orderId}`}
                        checked={order.selected ?? false}
                        onChange={() => toggleSelectOrder(order.id)}
                      />
                    </td>
                    <td className="cell-id">{order.orderId}</td>
                    <td className="cell-outlet">{order.outlet}</td>
                    <td className="cell-category">{order.category}</td>
                    <td>{order.items}</td>
                    <td>{order.weightKg}</td>
                    <td>{order.deliveryWindow}</td>
                    <td>
                      <span className={`badge-priority badge-${order.priority.toLowerCase()}`}>
                        {order.priority}
                      </span>
                    </td>
                    <td>
                      <span className="badge-status-pending">{order.status}</span>
                    </td>
                  </tr>
                ))}
                {visibleOrders.length === 0 && (
                  <tr>
                    <td colSpan={9} className="empty-table-cell">
                      No orders match the current filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: AI Planning Assistant Card */}
        <div className="dashboard-card ai-assistant-card">
          <h2 className="ai-assistant-title">AI Planning Assistant</h2>

          <div className="ai-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={planningTab === "quick"}
              className={`ai-tab-btn ${planningTab === "quick" ? "active" : ""}`}
              onClick={() => setPlanningTab("quick")}
            >
              Quick Plan
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={planningTab === "chat"}
              className={`ai-tab-btn ${planningTab === "chat" ? "active" : ""}`}
              onClick={() => setPlanningTab("chat")}
            >
              Chat
            </button>
          </div>

          <div className="ai-section-heading">Planning Objective</div>
          <div className="ai-radio-group">
            {[
              { id: "on-time", label: "Optimize for on-time delivery" },
              { id: "distance", label: "Minimize total distance" },
              { id: "capacity", label: "Optimize for on-time delivery" },
              { id: "balanced", label: "Optimize for on-time delivery" },
            ].map((option, idx) => (
              <label key={`${option.id}-${idx}`} className="ai-radio-label">
                <input
                  type="radio"
                  name={`${baseId}-objective`}
                  value={option.id}
                  checked={selectedObjective === option.id}
                  onChange={() => setSelectedObjective(option.id)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>

          <div className="ai-section-heading">Planning Objective</div>
          <div className="ai-date-picker">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span>13 Sep 2026</span>
          </div>

          <button
            type="button"
            className="ai-generate-btn"
            onClick={() => window.location.assign("/dispatcher/planning")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span>Generate AI Plan</span>
          </button>
        </div>
      </section>

      {/* 4. Bottom Row: 3 Columns */}
      <section className="dashboard-bottom-grid" aria-label="Routes, Vehicle Status, and Plan Summary">
        {/* Col 1: Vehicle Routes (Planned) */}
        <div className="dashboard-card routes-map-card">
          <h3 className="bottom-card-title">Vehicle Routes (Planned)</h3>
          <div className="routes-map-container" aria-label="Map showing planned vehicle routes">
            <svg className="routes-map-svg" viewBox="0 0 340 180" fill="none" aria-hidden="true">
              {/* Map background grid / streets */}
              <rect width="340" height="180" fill="#F1F5F9" />
              <path d="M0 40 H340 M0 90 H340 M0 140 H340" stroke="#E2E8F0" strokeWidth="1.5" />
              <path d="M60 0 V180 M130 0 V180 M210 0 V180 M280 0 V180" stroke="#E2E8F0" strokeWidth="1.5" />
              <path d="M10 170 L140 20 L270 170" stroke="#E2E8F0" strokeWidth="4" />
              <path d="M40 0 L320 180" stroke="#E2E8F0" strokeWidth="3" />

              {/* Connecting route path */}
              <polyline
                points="75,65 110,120 180,80 230,105 210,145 140,135 110,120"
                stroke="#1E293B"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Depot Icon */}
              <rect x="65" y="55" width="22" height="22" rx="4" fill="#0F172A" />
              <path d="M72 63 H80 V71 H72 Z" fill="#FFFFFF" />

              {/* Stop 1 */}
              <circle cx="110" cy="120" r="8" fill="#1E293B" />
              <text x="110" y="123" textAnchor="middle" fill="#FFFFFF" fontSize="9" fontWeight="700">1</text>

              {/* Stop 2 */}
              <circle cx="180" cy="80" r="8" fill="#1E293B" />
              <text x="180" y="83" textAnchor="middle" fill="#FFFFFF" fontSize="9" fontWeight="700">2</text>

              {/* Stop 3 */}
              <circle cx="230" cy="105" r="8" fill="#1E293B" />
              <text x="230" y="108" textAnchor="middle" fill="#FFFFFF" fontSize="9" fontWeight="700">3</text>

              {/* Stop 4 */}
              <circle cx="210" cy="145" r="8" fill="#1E293B" />
              <text x="210" y="148" textAnchor="middle" fill="#FFFFFF" fontSize="9" fontWeight="700">4</text>

              {/* Stop 5 */}
              <circle cx="140" cy="135" r="8" fill="#1E293B" />
              <text x="140" y="138" textAnchor="middle" fill="#FFFFFF" fontSize="9" fontWeight="700">5</text>
            </svg>

            {/* Map Controls */}
            <div className="map-controls">
              <button type="button" aria-label="Zoom in">+</button>
              <button type="button" aria-label="Zoom out">-</button>
              <button type="button" aria-label="Reset orientation">◎</button>
            </div>
          </div>
        </div>

        {/* Col 2: Vehicle Status */}
        <div className="dashboard-card vehicle-status-card">
          <div className="card-header-row">
            <h3 className="bottom-card-title">Vehicle Status</h3>
            <Link href="/dispatcher/routes" className="card-link-action">View All</Link>
          </div>

          <div className="vehicle-status-list">
            {defaultVehicles.map((v) => (
              <div key={v.vehicleId} className="vehicle-row">
                <span className="vehicle-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="3" width="15" height="13" />
                    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                    <circle cx="5.5" cy="18.5" r="2.5" />
                    <circle cx="18.5" cy="18.5" r="2.5" />
                  </svg>
                </span>
                <span className="vehicle-id">{v.vehicleId}</span>
                <span className="vehicle-type">{v.type}</span>
                <span className={`vehicle-badge badge-vehicle-${v.status.toLowerCase().replace(" ", "-")}`}>
                  {v.status}
                </span>
                <div className="vehicle-progress-track">
                  <div
                    className={`vehicle-progress-bar bar-${v.status.toLowerCase().replace(" ", "-")}`}
                    style={{ width: `${v.utilizationPercent}%` }}
                  />
                </div>
                <span className="vehicle-percent">{v.utilizationPercent}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Col 3: AI Suggested Summary */}
        <div className="dashboard-card ai-summary-card">
          <h3 className="bottom-card-title">AI Suggested Summary</h3>

          <div className="ai-summary-tiles">
            <div className="summary-tile">
              <span className="summary-tile-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="3" width="15" height="13" />
                  <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                  <circle cx="5.5" cy="18.5" r="2.5" />
                  <circle cx="18.5" cy="18.5" r="2.5" />
                </svg>
              </span>
              <div className="summary-tile-value">{defaultAiSummary.vehiclesRequired}</div>
              <div className="summary-tile-label">Vehicles required</div>
            </div>

            <div className="summary-tile">
              <span className="summary-tile-icon alert-red" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
              </span>
              <div className="summary-tile-value alert-red">{defaultAiSummary.ordersToDefer}</div>
              <div className="summary-tile-label alert-red">Orders to defer</div>
            </div>

            <div className="summary-tile">
              <span className="summary-tile-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </span>
              <div className="summary-tile-value">{defaultAiSummary.estimatedOnTime}</div>
              <div className="summary-tile-label">Estimated on-time</div>
            </div>

            <div className="summary-tile">
              <span className="summary-tile-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 22h12V4H3z" />
                  <path d="M15 10l4-2v8l-4 2" />
                  <circle cx="9" cy="10" r="2" />
                </svg>
              </span>
              <div className="summary-tile-value">{defaultAiSummary.fuelReduction}</div>
              <div className="summary-tile-label">Fuel reduction</div>
            </div>
          </div>

          <Link href="/dispatcher/planning" className="view-full-plan-btn">
            View Full AI Plan →
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
