"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  brandBreakdown,
  confirmOrderOnServer,
  countOrdersTabs,
  exportOrdersCsv,
  filterOrdersList,
  orderKpis,
  readOrderList,
  recentOrders,
  type DispatcherOrder,
  type OrderCategoryTab,
} from "../../../lib/dispatcher-orders";
import { noOperationalDateMessage, selectOperationalDateMessage, useOperationalDate } from "../operational-date";

type DeferralRow = { id: string; orderId: string; reason: string };

export default function DispatcherOrdersPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<OrderCategoryTab>("All");
  const [search, setSearch] = useState("");
  const [district, setDistrict] = useState("All Regions");
  const [brand, setBrand] = useState("All Categories");
  const [orders, setOrders] = useState<DispatcherOrder[]>([]);
  const [deferrals, setDeferrals] = useState<DeferralRow[]>([]);
  const [selected, setSelected] = useState<DispatcherOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [closingOrderId, setClosingOrderId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const operationalDate = useOperationalDate();

  async function fetchCsrfToken(): Promise<string> {
    try {
      const res = await fetch("/api/auth/csrf");
      if (res.ok) {
        const data = (await res.json()) as { csrfToken?: string };
        return data.csrfToken ?? "";
      }
    } catch {
      // return empty token on failure
    }
    return "";
  }

  async function handleCloseOrder(targetOrder: DispatcherOrder) {
    if (targetOrder.status !== "SUBMITTED" || closingOrderId !== null) return;
    setClosingOrderId(targetOrder.id);
    setActionFeedback(null);
    const csrfToken = await fetchCsrfToken();
    const result = await confirmOrderOnServer({
      orderId: targetOrder.id,
      csrfToken,
    });
    setClosingOrderId(null);
    if (result.ok) {
      setOrders((prev) =>
        prev.map((item) => (item.id === result.order.id ? result.order : item)),
      );
      if (selected?.id === targetOrder.id) {
        setSelected(result.order);
      }
      setActionFeedback(`Order ${targetOrder.orderId} successfully closed for planning (CONFIRMED).`);
    } else {
      if (result.code === "lifecycle_conflict") {
        // Refresh orders to reflect authoritative state
        try {
          const res = await fetch("/api/orders", { cache: "no-store" });
          if (res.ok) {
            const data: unknown = await res.json();
            const updated = readOrderList(data);
            setOrders(updated);
            const found = updated.find((o) => o.id === targetOrder.id);
            if (found && selected?.id === targetOrder.id) {
              setSelected(found);
            }
          }
        } catch {
          // ignore refresh failure
        }
      }
      setActionFeedback(result.message);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [ordersResponse, deferralsResponse] = await Promise.all([
          fetch("/api/orders", { cache: "no-store" }),
          fetch("/api/deferrals", { cache: "no-store" }),
        ]);
        const ordersPayload: unknown = await ordersResponse.json().catch(() => null);
        const deferralsPayload: unknown = await deferralsResponse.json().catch(() => null);
        if (!ordersResponse.ok) throw new Error("orders");
        if (cancelled) return;
        setOrders(readOrderList(ordersPayload));
        setDeferrals(readDeferrals(deferralsPayload));
        setError(null);
      } catch {
        if (!cancelled) {
          setOrders([]);
          setDeferrals([]);
          setError("Orders could not be loaded. No substitute figures are shown.");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleOrders = filterOrdersList(orders, { tab: activeTab, search, district, brand });
  const counts = countOrdersTabs(orders);
  const kpis = orderKpis(orders);
  const breakdown = brandBreakdown(orders);
  const recent = recentOrders(orders);
  const districts = [...new Set(orders.map((order) => order.district).filter((value) => value !== "—"))];
  const brands = [...new Set(orders.map((order) => order.brand).filter((value) => value !== "—"))];
  const orderById = new Map(orders.map((order) => [order.id, order]));

  async function runPlanning() {
    const date = operationalDate.selected;
    if (date === null || running) return;
    setRunning(true);
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
        body: JSON.stringify({ operationalDate: date }),
      });
      if (!response.ok) {
        setError("Planning did not run.");
        return;
      }
      router.push("/dispatcher/planning");
    } catch {
      setError("Planning could not be reached.");
    } finally {
      setRunning(false);
    }
  }

  function exportVisible() {
    const csv = exportOrdersCsv(visibleOrders);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "wayloom-orders.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="orders-page-container">
      {error && <div className="dashboard-error" role="alert">{error}</div>}
      {operationalDate.status === "empty" ? <div className="dashboard-error" role="status">{noOperationalDateMessage}</div> : null}
      {operationalDate.status === "ready" && operationalDate.selected === null ? <div className="dashboard-error" role="status">{selectOperationalDateMessage}</div> : null}
      {actionFeedback && <div className="dashboard-feedback" role="status">{actionFeedback}</div>}
      <section className="orders-kpi-grid" aria-label="Orders KPI Summary">
        {kpis.map((kpi) => (
          <div key={kpi.id} className="kpi-card">
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value">{kpi.value}</div>
            <div className="kpi-subtitle">{kpi.subtitle}</div>
          </div>
        ))}
      </section>

      <section className="orders-filter-row" aria-label="Order Filter Controls">
        <div className="filter-select-wrapper">
          <select value={district} onChange={(event) => setDistrict(event.target.value)} aria-label="Filter by district">
            <option value="All Regions">All Regions</option>
            {districts.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
        <div className="filter-select-wrapper">
          <select value={brand} onChange={(event) => setBrand(event.target.value)} aria-label="Filter by brand">
            <option value="All Categories">All Categories</option>
            {brands.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
        <div className="filter-select-wrapper">
          <select aria-label="Filter by priority" disabled defaultValue="All Priorities">
            <option>All Priorities</option>
          </select>
        </div>
        <div className="filter-select-wrapper">
          <select aria-label="Filter by order type" disabled defaultValue="All Order Types">
            <option>All Order Types</option>
          </select>
        </div>
        <div className="filter-select-wrapper">
          <select aria-label="Filter by delivery window" disabled defaultValue="Delivery Window">
            <option>Delivery Window</option>
          </select>
        </div>
        <button type="button" className="filter-more-btn" onClick={() => { setDistrict("All Regions"); setBrand("All Categories"); setSearch(""); setActiveTab("All"); }}>
          Reset filters
        </button>
      </section>

      <section className="orders-action-bar" aria-label="Category tabs and table search">
        <div className="order-filter-tabs" role="tablist">
          {(["All", "Fresh", "Style", "Tech", "High Risk"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              disabled={tab === "High Risk"}
              aria-selected={activeTab === tab}
              className={`order-tab-btn ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "All" ? `All Orders (${counts.All})` : `${tab} (${counts[tab]})`}
            </button>
          ))}
        </div>
        <div className="orders-table-tools">
          <div className="orders-search-box">
            <input type="text" placeholder="Search orders..." value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search orders table" />
          </div>
          <button type="button" className="orders-export-btn" onClick={exportVisible}>Export</button>
        </div>
      </section>

      <section className="orders-middle-grid" aria-label="Orders table and planning insights">
        <div className="dashboard-card orders-table-card">
          <div className="orders-table-wrapper">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Outlet</th>
                  <th>Brand</th>
                  <th>Items</th>
                  <th>Weight (kg)</th>
                  <th>Delivery Window</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="cell-id"><button type="button" className="cell-id-btn" onClick={() => setSelected(order)}>{order.orderId}</button></td>
                    <td className="cell-outlet">{order.outlet}</td>
                    <td className="cell-category">{order.brand}</td>
                    <td>{order.items}</td>
                    <td>{order.weightKg}</td>
                    <td>—</td>
                    <td>—</td>
                    <td><span className="badge-status-pending">{order.status}</span></td>
                    <td>
                      <div className="order-row-actions">
                        {order.status === "SUBMITTED" && (
                          <button
                            type="button"
                            className="table-close-order-btn"
                            onClick={() => void handleCloseOrder(order)}
                            disabled={closingOrderId !== null}
                            aria-label={`Confirm order ${order.orderId}`}
                          >
                            {closingOrderId === order.id ? "Closing..." : "Close order"}
                          </button>
                        )}
                        <button type="button" className="table-action-menu-btn" onClick={() => setSelected(order)} aria-label={`View ${order.orderId}`}>⋮</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {visibleOrders.length === 0 && <tr><td colSpan={9} className="empty-table-cell">No orders match the current filter.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <aside className="orders-sidebar-panels">
          <div className="dashboard-card selected-orders-card">
            <h2 className="selected-orders-title">Selected Orders</h2>
            <div className="selected-orders-count">—</div>
            <div className="selected-orders-subtitle">Planning does not accept a selected subset</div>
            <button type="button" className="ai-generate-btn" onClick={() => void runPlanning()} disabled={operationalDate.selected === null || running}>
              {running ? "Running planning..." : "Run planning"}
            </button>
          </div>
          <div className="dashboard-card order-insights-card">
            <h2 className="insights-card-title">Order Insights</h2>
            <div className="order-insights-list">
              <p className="insight-text">{orders.length} orders loaded.</p>
              <p className="insight-text">{orders.filter((order) => order.temperature === "chilled").length} chilled orders.</p>
              <p className="insight-text">{orders.filter((order) => order.status === "DEFERRED").length} orders have deferred status.</p>
              <p className="insight-text">Delay risk, capacity overflow, and delivery windows are not on the order record.</p>
            </div>
          </div>
          <div className="dashboard-card category-breakdown-card">
            <h2 className="breakdown-card-title">Category Breakdown</h2>
            <div className="breakdown-content">
              <div className="breakdown-donut-wrapper">
                <div className="breakdown-donut-center"><span className="donut-center-total">{orders.length}</span></div>
              </div>
              <div className="breakdown-legend">
                {breakdown.length === 0 && <div className="legend-row">No brands loaded</div>}
                {breakdown.map((item) => (
                  <div key={item.name} className="legend-row">
                    <span className="legend-label">{item.name} ({item.count}) {item.percentage}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </section>

      <section className="orders-bottom-grid" aria-label="Recent and deferred orders">
        <div className="dashboard-card bottom-card">
          <h3 className="bottom-card-title">Recent Orders</h3>
          <table className="bottom-sub-table">
            <thead><tr><th>Order ID</th><th>Outlet</th><th>Brand</th><th>Items</th><th>Submitted</th><th>Status</th></tr></thead>
            <tbody>
              {recent.map((order) => (
                <tr key={order.id}>
                  <td className="cell-id">{order.orderId}</td>
                  <td>{order.outlet}</td>
                  <td>{order.brand}</td>
                  <td>{order.items}</td>
                  <td>{order.submittedAt ?? "—"}</td>
                  <td>{order.status}</td>
                </tr>
              ))}
              {recent.length === 0 && <tr><td colSpan={6}>No orders loaded.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="dashboard-card bottom-card">
          <h3 className="bottom-card-title">Deferred orders ({deferrals.length})</h3>
          <table className="bottom-sub-table">
            <thead><tr><th>Order ID</th><th>Outlet</th><th>Reason</th><th>Priority</th></tr></thead>
            <tbody>
              {deferrals.map((deferral) => {
                const order = orderById.get(deferral.orderId);
                return (
                  <tr key={deferral.id}>
                    <td>{order?.orderId ?? deferral.orderId}</td>
                    <td>{order?.outlet ?? "—"}</td>
                    <td>{deferral.reason}</td>
                    <td>—</td>
                  </tr>
                );
              })}
              {deferrals.length === 0 && <tr><td colSpan={4}>No deferrals returned.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {selected && (
        <div className="order-detail-backdrop" onClick={() => setSelected(null)}>
          <div className="order-detail-modal" role="dialog" aria-modal="true" aria-labelledby="order-detail-title" onClick={(event) => event.stopPropagation()}>
            <div className="order-detail-header">
              <h2 id="order-detail-title">{selected.orderId}</h2>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close detail modal">✕</button>
            </div>
            <div className="order-detail-body">
              <p>Outlet {selected.outlet}</p>
              <p>District {selected.district}</p>
              <p>Depot {selected.depot}</p>
              <p>Brand {selected.brand}</p>
              <p>Temperature {selected.temperature}</p>
              <p>Units {selected.items}</p>
              <p>Weight {selected.weightKg} kg</p>
              <p>Volume {selected.volumeM3} m3</p>
              <p>Status {selected.status}</p>
              <p>Delivery window —</p>
              <p>Priority —</p>
            </div>
            <div className="order-detail-footer">
              <button type="button" className="btn-secondary" onClick={() => setSelected(null)}>Close</button>
              {selected.status === "SUBMITTED" && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => void handleCloseOrder(selected)}
                  disabled={closingOrderId !== null}
                >
                  {closingOrderId === selected.id ? "Closing order..." : "Close order"}
                </button>
              )}
              <button type="button" className="btn-primary" onClick={() => { setSelected(null); void runPlanning(); }}>Run planning</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function readDeferrals(value: unknown): DeferralRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.orderId !== "string" || typeof record.reason !== "string") return [];
    return [{ id: record.id, orderId: record.orderId, reason: record.reason }];
  });
}
