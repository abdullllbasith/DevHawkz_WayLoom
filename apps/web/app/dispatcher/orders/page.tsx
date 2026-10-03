"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  defaultCategoryBreakdown,
  defaultHighRiskOrders,
  defaultOrderInsights,
  defaultOrdersKpis,
  defaultOrdersTableData,
  defaultRecentOrders,
  exportOrdersCsv,
  filterOrdersList,
  type DispatcherOrder,
  type OrderCategoryTab,
  type OrderFilters,
} from "../../../lib/dispatcher-orders";

export default function DispatcherOrdersPage() {
  const router = useRouter();
  const selectAllId = useId();

  const [activeTab, setActiveTab] = useState<OrderCategoryTab>("All");
  const [filters, setFilters] = useState<OrderFilters>({
    tab: "All",
    search: "",
    region: "All Regions",
    category: "All Categories",
    priority: "All Priorities",
    orderType: "All Order Types",
    deliveryWindow: "Delivery Window",
  });

  const [orders, setOrders] = useState<DispatcherOrder[]>(() => [...defaultOrdersTableData]);
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<DispatcherOrder | null>(null);

  const visibleOrders = filterOrdersList(orders, {
    tab: activeTab,
    search: filters.search,
    region: filters.region,
    category: filters.category,
    priority: filters.priority,
    deliveryWindow: filters.deliveryWindow,
  });

  const selectedOrdersCount = orders.filter((o) => o.selected).length;

  const toggleSelectOrder = (id: string) => {
    setOrders((prev) =>
      prev.map((order) => (order.id === id ? { ...order, selected: !order.selected } : order)),
    );
  };

  const toggleSelectAll = () => {
    const allSelected = visibleOrders.length > 0 && visibleOrders.every((o) => o.selected);
    const visibleIds = new Set(visibleOrders.map((o) => o.id));
    setOrders((prev) =>
      prev.map((order) =>
        visibleIds.has(order.id) ? { ...order, selected: !allSelected } : order,
      ),
    );
  };

  const handleExport = () => {
    const csvContent = exportOrdersCsv(visibleOrders);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `wayloom-orders-${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleGenerateAiPlan = () => {
    const selectedIds = orders.filter((o) => o.selected).map((o) => o.id);
    const query = selectedIds.length > 0 ? `?selected=${selectedIds.join(",")}` : "";
    router.push(`/dispatcher/planning${query}`);
  };

  return (
    <div className="orders-page-container">
      {/* 1. Top KPI Summary Cards */}
      <section className="orders-kpi-grid" aria-label="Orders KPI Summary">
        {defaultOrdersKpis.map((kpi) => (
          <div key={kpi.id} className="kpi-card">
            <div className="kpi-card-top">
              <span className="kpi-icon-box" aria-hidden="true">
                {renderKpiIcon(kpi.id)}
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

      {/* 2. Filter Controls Row */}
      <section className="orders-filter-row" aria-label="Order Filter Controls">
        <div className="filter-select-wrapper">
          <span className="filter-leading-icon" aria-hidden="true">📍</span>
          <select
            value={filters.region}
            onChange={(e) => setFilters((prev) => ({ ...prev, region: e.target.value }))}
            aria-label="Filter by region"
          >
            <option value="All Regions">All Regions</option>
            <option value="Colombo">Colombo</option>
            <option value="Kandy">Kandy</option>
            <option value="Galle">Galle</option>
            <option value="Jaffna">Jaffna</option>
            <option value="Negombo">Negombo</option>
            <option value="Trincomalee">Trincomalee</option>
          </select>
        </div>

        <div className="filter-select-wrapper">
          <span className="filter-leading-icon" aria-hidden="true">▦</span>
          <select
            value={filters.category}
            onChange={(e) => setFilters((prev) => ({ ...prev, category: e.target.value }))}
            aria-label="Filter by category"
          >
            <option value="All Categories">All Categories</option>
            <option value="Fresh">Fresh</option>
            <option value="Style">Style</option>
            <option value="Tech">Tech</option>
            <option value="General">General</option>
          </select>
        </div>

        <div className="filter-select-wrapper">
          <span className="filter-leading-icon" aria-hidden="true">⚑</span>
          <select
            value={filters.priority}
            onChange={(e) => setFilters((prev) => ({ ...prev, priority: e.target.value }))}
            aria-label="Filter by priority"
          >
            <option value="All Priorities">All Priorities</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>

        <div className="filter-select-wrapper">
          <span className="filter-leading-icon" aria-hidden="true">📦</span>
          <select
            value={filters.orderType}
            onChange={(e) => setFilters((prev) => ({ ...prev, orderType: e.target.value }))}
            aria-label="Filter by order type"
          >
            <option value="All Order Types">All Order Types</option>
            <option value="Standard">Standard</option>
            <option value="Express">Express</option>
            <option value="Bulk">Bulk</option>
          </select>
        </div>

        <div className="filter-select-wrapper">
          <span className="filter-leading-icon" aria-hidden="true">🕒</span>
          <select
            value={filters.deliveryWindow}
            onChange={(e) => setFilters((prev) => ({ ...prev, deliveryWindow: e.target.value }))}
            aria-label="Filter by delivery window"
          >
            <option value="Delivery Window">Delivery Window</option>
            <option value="8:00 - 10:00 AM">8:00 - 10:00 AM</option>
            <option value="9:00 - 12:00 PM">9:00 - 12:00 PM</option>
            <option value="10:00 - 2:00 PM">10:00 - 2:00 PM</option>
            <option value="12:00 - 4:00 PM">12:00 - 4:00 PM</option>
          </select>
        </div>

        <button
          type="button"
          className="filter-more-btn"
          onClick={() => {
            setFilters({
              tab: "All",
              search: "",
              region: "All Regions",
              category: "All Categories",
              priority: "All Priorities",
              orderType: "All Order Types",
              deliveryWindow: "Delivery Window",
            });
            setActiveTab("All");
          }}
          aria-label="Reset or toggle filters"
        >
          <span aria-hidden="true">⫶⫶</span> More Filters
        </button>
      </section>

      {/* 3. Category Tabs & Search/Export Action Row */}
      <section className="orders-action-bar" aria-label="Category tabs and table search">
        <div className="order-filter-tabs" role="tablist" aria-label="Order category filter">
          {(
            [
              { id: "All", label: "All Orders (105)" },
              { id: "Fresh", label: "Fresh (42)" },
              { id: "Style", label: "Style (38)" },
              { id: "Tech", label: "Tech (18)" },
              { id: "High Risk", label: "High Risk (7)" },
            ] as const
          ).map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`order-tab-btn ${isActive ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="orders-table-tools">
          <div className="orders-search-box">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#64748B"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search orders..."
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              aria-label="Search orders table"
            />
          </div>

          <button
            type="button"
            className="orders-export-btn"
            onClick={handleExport}
            aria-label="Export orders to CSV"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Export</span>
          </button>
        </div>
      </section>

      {/* 4. Middle Grid: Orders Table + Right Insights Panel */}
      <section className="orders-middle-grid" aria-label="Orders table and planning insights">
        {/* Left Column: Orders Table Card */}
        <div className="dashboard-card orders-table-card">
          <div className="orders-table-wrapper">
            <table className="orders-table">
              <thead>
                <tr>
                  <th style={{ width: "36px" }}>
                    <input
                      id={selectAllId}
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
                  <th>Weight (kg)</th>
                  <th>Delivery Window</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th style={{ width: "40px", textAlign: "center" }}>Actions</th>
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
                    <td className="cell-id">
                      <button
                        type="button"
                        className="cell-id-btn"
                        onClick={() => setSelectedOrderForDetail(order)}
                        title="View order details"
                      >
                        {order.orderId}
                      </button>
                    </td>
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
                    <td style={{ textAlign: "center" }}>
                      <button
                        type="button"
                        className="table-action-menu-btn"
                        onClick={() => setSelectedOrderForDetail(order)}
                        aria-label={`Actions for order ${order.orderId}`}
                      >
                        ⋮
                      </button>
                    </td>
                  </tr>
                ))}
                {visibleOrders.length === 0 && (
                  <tr>
                    <td colSpan={10} className="empty-table-cell">
                      No orders match the current filter criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Selected Orders + Order Insights + Category Breakdown */}
        <aside className="orders-sidebar-panels" aria-label="Order selection and insights">
          {/* Selected Orders Card */}
          <div className="dashboard-card selected-orders-card">
            <h2 className="selected-orders-title">Selected Orders</h2>
            <div className="selected-orders-count">{selectedOrdersCount}</div>
            <div className="selected-orders-subtitle">orders selected</div>

            <button
              type="button"
              className="ai-generate-btn"
              onClick={handleGenerateAiPlan}
              aria-label="Generate AI Plan with selected orders"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              <span>Generate AI Plan</span>
            </button>
          </div>

          {/* Order Insights Card */}
          <div className="dashboard-card order-insights-card">
            <h2 className="insights-card-title">Order Insights</h2>
            <div className="order-insights-list">
              {defaultOrderInsights.map((insight) => (
                <div key={insight.id} className="insight-row">
                  <span className={`insight-icon-box icon-${insight.type}`} aria-hidden="true">
                    {renderInsightIcon(insight.type)}
                  </span>
                  <p className="insight-text">
                    <strong className="insight-strong">{insight.highlightText}</strong> {insight.text}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Category Breakdown Card */}
          <div className="dashboard-card category-breakdown-card">
            <h2 className="breakdown-card-title">Category Breakdown</h2>
            <div className="breakdown-content">
              {/* Donut Chart */}
              <div className="breakdown-donut-wrapper">
                <svg viewBox="0 0 100 100" className="breakdown-donut-svg" aria-hidden="true">
                  <circle cx="50" cy="50" r="38" fill="none" stroke="#E2E8F0" strokeWidth="14" />
                  {/* Fresh slice (~40%) */}
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    fill="none"
                    stroke="#10B981"
                    strokeWidth="14"
                    strokeDasharray="95.5 238.7"
                    strokeDashoffset="0"
                  />
                  {/* Style slice (~36%) */}
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    fill="none"
                    stroke="#8B5CF6"
                    strokeWidth="14"
                    strokeDasharray="86.4 238.7"
                    strokeDashoffset="-95.5"
                  />
                  {/* Tech slice (~17%) */}
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    fill="none"
                    stroke="#3B82F6"
                    strokeWidth="14"
                    strokeDasharray="40.8 238.7"
                    strokeDashoffset="-181.9"
                  />
                  {/* Others slice (~7%) */}
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    fill="none"
                    stroke="#94A3B8"
                    strokeWidth="14"
                    strokeDasharray="16.0 238.7"
                    strokeDashoffset="-222.7"
                  />
                </svg>
                <div className="breakdown-donut-center">
                  <span className="donut-center-total">105</span>
                </div>
              </div>

              {/* Legend */}
              <div className="breakdown-legend">
                {defaultCategoryBreakdown.map((item) => (
                  <div key={item.name} className="legend-row">
                    <span className="legend-dot" style={{ backgroundColor: item.color }} aria-hidden="true" />
                    <span className="legend-label">{item.name} ({item.count})</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </section>

      {/* 5. Bottom Row: Recent Orders (50%) + High-Risk Orders (50%) */}
      <section className="orders-bottom-grid" aria-label="Recent and High-Risk Orders">
        {/* Recent Orders */}
        <div className="dashboard-card bottom-card">
          <div className="card-header-row">
            <h3 className="bottom-card-title">Recent Orders</h3>
            <Link href="/dispatcher/orders" className="card-link-action">View All</Link>
          </div>

          <div className="bottom-table-wrapper">
            <table className="bottom-sub-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Outlet</th>
                  <th>Category</th>
                  <th>Items</th>
                  <th>Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {defaultRecentOrders.map((ro) => (
                  <tr key={ro.orderId}>
                    <td className="cell-id">{ro.orderId}</td>
                    <td className="cell-outlet">{ro.outlet}</td>
                    <td className="cell-category">{ro.category}</td>
                    <td>{ro.items}</td>
                    <td className="cell-time">{ro.time}</td>
                    <td>
                      <span className="badge-new-status">{ro.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* High-Risk Orders (7) */}
        <div className="dashboard-card bottom-card">
          <div className="card-header-row">
            <h3 className="bottom-card-title">High-Risk Orders (7)</h3>
            <Link href="/dispatcher/orders" className="card-link-action">View All</Link>
          </div>

          <div className="bottom-table-wrapper">
            <table className="bottom-sub-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Outlet</th>
                  <th>Reason</th>
                  <th>Priority</th>
                </tr>
              </thead>
              <tbody>
                {defaultHighRiskOrders.map((hro) => (
                  <tr key={hro.orderId}>
                    <td className="cell-id">{hro.orderId}</td>
                    <td className="cell-outlet">{hro.outlet}</td>
                    <td className="cell-reason">{hro.reason}</td>
                    <td>
                      <span className={`badge-priority badge-${hro.priority.toLowerCase()}`}>
                        {hro.priority}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 6. Authoritative Order Review Detail Modal */}
      {selectedOrderForDetail && (
        <div className="order-detail-backdrop" onClick={() => setSelectedOrderForDetail(null)}>
          <div
            className="order-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="order-detail-header">
              <div>
                <span className="detail-eyebrow">Order Review</span>
                <h2 id="order-detail-title" className="order-detail-title">
                  {selectedOrderForDetail.orderId}
                </h2>
              </div>
              <button
                type="button"
                className="order-detail-close"
                onClick={() => setSelectedOrderForDetail(null)}
                aria-label="Close detail modal"
              >
                ✕
              </button>
            </div>

            <div className="order-detail-body">
              <div className="detail-meta-grid">
                <div className="detail-item">
                  <span className="detail-label">Outlet</span>
                  <span className="detail-val">{selectedOrderForDetail.outlet}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Region</span>
                  <span className="detail-val">{selectedOrderForDetail.region}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Category</span>
                  <span className="detail-val">{selectedOrderForDetail.category}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Delivery Window</span>
                  <span className="detail-val">{selectedOrderForDetail.deliveryWindow}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Total Items</span>
                  <span className="detail-val">{selectedOrderForDetail.items} units</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Total Weight</span>
                  <span className="detail-val">{selectedOrderForDetail.weightKg} kg</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Priority</span>
                  <span className={`badge-priority badge-${selectedOrderForDetail.priority.toLowerCase()}`}>
                    {selectedOrderForDetail.priority}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Current Status</span>
                  <span className="badge-status-pending">{selectedOrderForDetail.status}</span>
                </div>
              </div>

              <div className="detail-notes-box">
                <p className="detail-notes-title">Authoritative Lifecycle</p>
                <p className="detail-notes-text">
                  This order has been submitted by Store Manager and is currently pending planning allocation.
                  Planning &amp; Allocation handles vehicle assignment and routing.
                </p>
              </div>
            </div>

            <div className="order-detail-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSelectedOrderForDetail(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setSelectedOrderForDetail(null);
                  router.push(`/dispatcher/planning?selected=${selectedOrderForDetail.id}`);
                }}
              >
                Proceed to Planning
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function renderKpiIcon(id: string) {
  switch (id) {
    case "total":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      );
    case "fresh":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
          <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
        </svg>
      );
    case "standard":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
      );
    case "tech":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <rect x="9" y="9" width="6" height="6" />
          <line x1="9" y1="1" x2="9" y2="4" />
          <line x1="15" y1="1" x2="15" y2="4" />
          <line x1="9" y1="20" x2="9" y2="23" />
          <line x1="15" y1="20" x2="15" y2="23" />
          <line x1="20" y1="9" x2="23" y2="9" />
          <line x1="20" y1="14" x2="23" y2="14" />
          <line x1="1" y1="9" x2="4" y2="9" />
          <line x1="1" y1="14" x2="4" y2="14" />
        </svg>
      );
    case "high-risk":
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

function renderInsightIcon(type: "risk" | "capacity" | "window" | "temp") {
  switch (type) {
    case "risk":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case "capacity":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="3" width="15" height="13" />
          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
      );
    case "window":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    case "temp":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
          <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
        </svg>
      );
    default:
      return null;
  }
}
