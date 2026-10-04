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
import { shortId } from "../../../lib/short-id";
import { StatusBadge, StatusBanner } from "../../status-banner";
import { humanActionError } from "../../../lib/status-copy";
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
      setActionFeedback(`Order ${shortId(targetOrder.orderId)} successfully closed for planning (CONFIRMED).`);
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
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(humanActionError(response.status, payload, "planning"));
        return;
      }
      router.push("/dispatcher/planning");
    } catch {
      setError(humanActionError(0, null, "planning"));
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

  if (operationalDate.status === "loading") {
    return <StatusBanner tone="loading" title="Reading operational dates" body="Orders stay hidden until the date list is known." />;
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
    <div className="orders-page-container">
      {error && <div className="dashboard-error" role="alert">{error}</div>}
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
            <SearchIcon />
            <input type="text" placeholder="Search orders..." value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search orders table" />
          </div>
          <button type="button" className="orders-export-btn" onClick={exportVisible}>
            <ExportIcon />
            Export
          </button>
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
                    <td className="cell-id"><button type="button" className="cell-id-btn" title={order.orderId} onClick={() => setSelected(order)}>{shortId(order.orderId)}</button></td>
                    <td className="cell-outlet">{order.outlet}</td>
                    <td className="cell-category">{order.brand}</td>
                    <td>{order.items}</td>
                    <td>{order.weightKg}</td>
                    <td>—</td>
                    <td>—</td>
                    <td><StatusBadge status={order.status} /></td>
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
            <div className="panel-title-row">
              <span className="panel-icon" aria-hidden="true"><ClipboardIcon /></span>
              <h2 className="selected-orders-title">Selected Orders</h2>
            </div>
            <div className="insight-row">
              <span className="insight-icon-box icon-window" aria-hidden="true"><InfoIcon /></span>
              <p className="insight-text">Planning does not accept a selected subset</p>
            </div>
            <button type="button" className="ai-generate-btn" onClick={() => void runPlanning()} disabled={operationalDate.selected === null || running}>
              <BoltIcon />
              {running ? "Running planning..." : "Run planning"}
            </button>
          </div>
          <div className="dashboard-card order-insights-card">
            <div className="panel-title-row">
              <span className="panel-icon tone-blue" aria-hidden="true"><InsightsIcon /></span>
              <h2 className="insights-card-title">Order Insights</h2>
            </div>
            <div className="order-insights-list">
              <div className="insight-row">
                <span className="insight-icon-box icon-capacity" aria-hidden="true"><PackageIcon /></span>
                <p className="insight-text"><span className="insight-strong">{orders.length}</span> orders loaded.</p>
              </div>
              <div className="insight-row">
                <span className="insight-icon-box icon-temp" aria-hidden="true"><ThermometerIcon /></span>
                <p className="insight-text"><span className="insight-strong">{orders.filter((order) => order.temperature === "chilled").length}</span> chilled orders.</p>
              </div>
              <div className="insight-row">
                <span className="insight-icon-box icon-risk" aria-hidden="true"><AlertIcon /></span>
                <p className="insight-text"><span className="insight-strong">{orders.filter((order) => order.status === "DEFERRED").length}</span> orders have deferred status.</p>
              </div>
              <div className="insight-row">
                <span className="insight-icon-box icon-window" aria-hidden="true"><InfoIcon /></span>
                <p className="insight-text">Delay risk, capacity overflow, and delivery windows are not on the order record.</p>
              </div>
            </div>
          </div>
          <div className="dashboard-card category-breakdown-card">
            <div className="panel-title-row">
              <span className="panel-icon tone-green" aria-hidden="true"><PieIcon /></span>
              <h2 className="breakdown-card-title">Category Breakdown</h2>
            </div>
            <div className="breakdown-content">
              <div className="breakdown-donut-wrapper">
                <CategoryDonut items={breakdown} total={orders.length} />
                <div className="breakdown-donut-center"><span className="donut-center-total">{orders.length}</span></div>
              </div>
              <div className="breakdown-legend">
                {breakdown.length === 0 && <div className="legend-row">No brands loaded</div>}
                {breakdown.map((item, index) => (
                  <div key={item.name} className="legend-row">
                    <span className="legend-dot" style={{ background: brandColor(item.name, index) }} />
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
                  <td className="cell-id" title={order.orderId}>{shortId(order.orderId)}</td>
                  <td>{order.outlet}</td>
                  <td>{order.brand}</td>
                  <td>{order.items}</td>
                  <td>{order.submittedAt ?? "—"}</td>
                  <td><StatusBadge status={order.status} /></td>
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
                    <td title={order?.orderId ?? deferral.orderId}>{shortId(order?.orderId ?? deferral.orderId)}</td>
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
              <h2 id="order-detail-title" title={selected.orderId}>{shortId(selected.orderId)}</h2>
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
              <p>Status <StatusBadge status={selected.status} /></p>
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

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
    </svg>
  );
}

function InsightsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12c.6.6 1 1.5 1 2h6c0-.5.4-1.4 1-2a7 7 0 0 0-4-12z" />
    </svg>
  );
}

function PieIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
  );
}

function PackageIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function ThermometerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function brandColor(name: string, index: number): string {
  const known: Record<string, string> = {
    fresh: "#16a34a",
    style: "#db2777",
    tech: "#2563eb",
    unspecified: "#94a3b8",
  };
  return known[name.toLowerCase()] ?? ["#0f766e", "#7c3aed", "#d97706", "#0284c7"][index % 4]!;
}

function CategoryDonut({ items, total }: { items: { name: string; count: number }[]; total: number }) {
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  if (items.length <= 1) {
    const color = items.length === 1 ? brandColor(items[0]!.name, 0) : "#e2e8f0";
    return (
      <svg className="breakdown-donut-svg" viewBox="0 0 84 84" aria-hidden="true">
        <circle cx="42" cy="42" r={radius} fill="none" stroke={color} strokeWidth="10" />
      </svg>
    );
  }
  let offset = 0;
  return (
    <svg className="breakdown-donut-svg" viewBox="0 0 84 84" aria-hidden="true">
      <circle cx="42" cy="42" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="10" />
      {items.map((item, index) => {
        const length = total === 0 ? 0 : (item.count / total) * circumference;
        const dash = `${length} ${circumference - length}`;
        const sliceOffset = offset;
        offset -= length;
        return (
          <circle
            key={item.name}
            cx="42"
            cy="42"
            r={radius}
            fill="none"
            stroke={brandColor(item.name, index)}
            strokeWidth="10"
            strokeDasharray={dash}
            strokeDashoffset={sliceOffset}
          />
        );
      })}
    </svg>
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
