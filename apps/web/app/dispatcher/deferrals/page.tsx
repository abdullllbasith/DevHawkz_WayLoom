"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  computeDeferralsKpis,
  exportDeferralsCsv,
  filterDeferralsList,
  isDeferralReasonCode,
  isPostCutoffOrder,
  mergeOrderDeferrals,
  readDeferralList,
  type EnrichedDeferral,
} from "../../../lib/dispatcher-deferrals";
import { readOrderList, type DispatcherOrder } from "../../../lib/dispatcher-orders";
import { useOperationalDate } from "../operational-date";
import { readPlanningResult, type PlanDeferral } from "../../../lib/dispatcher-planning";

export default function DispatcherDeferralsPage() {
  const router = useRouter();

  const [orders, setOrders] = useState<DispatcherOrder[]>([]);
  const [deferrals, setDeferrals] = useState<EnrichedDeferral[]>([]);
  const [selectedDeferral, setSelectedDeferral] = useState<EnrichedDeferral | null>(null);
  const [operationalDate, setOperationalDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const planningDate = useOperationalDate();

  // Filters
  const [search, setSearch] = useState("");
  const [reasonFilter, setReasonFilter] = useState("ALL");
  const [depotFilter, setDepotFilter] = useState("ALL");
  const [brandFilter, setBrandFilter] = useState("ALL");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [ordersRes, deferralsRes] = await Promise.all([
          fetch("/api/orders", { cache: "no-store" }),
          fetch("/api/deferrals", { cache: "no-store" }),
        ]);

        if (ordersRes.status === 401 || ordersRes.status === 403 || deferralsRes.status === 401 || deferralsRes.status === 403) {
          if (!cancelled) {
            setError("Authorization failure: You do not have permission to view Dispatcher deferrals.");
            setLoading(false);
          }
          return;
        }

        if (!ordersRes.ok || !deferralsRes.ok) {
          if (!cancelled) {
            setError("Unable to load deferrals from the server. No substitute figures are shown.");
            setLoading(false);
          }
          return;
        }

        const ordersPayload: unknown = await ordersRes.json().catch(() => null);
        const deferralsPayload: unknown = await deferralsRes.json().catch(() => null);

        const parsedOrders = readOrderList(ordersPayload);
        const storedDeferrals = readDeferralList(deferralsPayload);

        const derivedDate = planningDate.selected;

        // Also fetch planning results if operational date exists to capture all planned deferrals
        let planDeferrals: PlanDeferral[] = [];
        if (derivedDate) {
          const planRes = await fetch(`/api/planning/${encodeURIComponent(derivedDate)}`, { cache: "no-store" }).catch(() => null);
          if (planRes && planRes.ok) {
            const planPayload: unknown = await planRes.json().catch(() => null);
            const planView = readPlanningResult(planPayload);
            planDeferrals = planView.deferrals;
          }
        }

        // Merge stored and planning deferrals (avoid duplicate orderId)
        const allStored = [...storedDeferrals];
        const existingOrderIds = new Set(allStored.map((d) => d.orderId));
        for (const pd of planDeferrals) {
          if (!existingOrderIds.has(pd.orderId) && isDeferralReasonCode(pd.reason)) {
            allStored.push({
              id: pd.id,
              orderId: pd.orderId,
              reason: pd.reason,
              reportedAt: pd.reportedAt,
            });
            existingOrderIds.add(pd.orderId);
          }
        }

        const enriched = mergeOrderDeferrals(allStored, parsedOrders);

        if (!cancelled) {
          setOrders(parsedOrders);
          setDeferrals(enriched);
          setSelectedDeferral(enriched[0] ?? null);
          setOperationalDate(derivedDate);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("Deferral records could not be retrieved due to a network connection error.");
          setLoading(false);
        }
      }
    }

    if (planningDate.status === "loading") return () => {
      cancelled = true;
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [planningDate.selected, planningDate.status]);

  const filteredDeferrals = filterDeferralsList(deferrals, {
    search,
    reason: reasonFilter,
    depot: depotFilter,
    brand: brandFilter,
  });

  const kpis = computeDeferralsKpis(deferrals);

  // Identify post-cutoff orders that are awaiting the following run
  const postCutoffOrders = orders.filter(
    (o) => /^\d{4}-\d{2}-\d{2}$/.test(o.orderDate) && isPostCutoffOrder(o.submittedAt, o.orderDate),
  );

  function handleExportCsv() {
    const csv = exportDeferralsCsv(filteredDeferrals);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `wayloom-deferrals-${operationalDate ?? "export"}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="deferrals-page-container">
        <div className="dashboard-card" style={{ padding: "40px", textAlign: "center" }}>
          <p className="kpi-subtitle">Loading authoritative deferrals and planning constraints...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="deferrals-page-container">
      {error && (
        <div className="dashboard-error" role="alert">
          <span>{error}</span>
        </div>
      )}

      {/* Informational Callout: Distinguishing Deferrals from Cutoff-Ineligible Orders */}
      {postCutoffOrders.length > 0 && (
        <div className="deferral-constraint-callout" style={{ borderLeftColor: "#2563eb", backgroundColor: "#eff6ff" }}>
          <strong>Cutoff Boundary Notice:</strong> {postCutoffOrders.length} order(s) were submitted after the 16:00:00 cutoff and are awaiting the following planning cycle. They are not capacity deferrals.
        </div>
      )}

      {/* 1. Top KPI Summary */}
      <section className="deferrals-kpi-grid" aria-label="Deferral Key Performance Indicators">
        <div className="kpi-card">
          <div className="kpi-label">Total Deferred</div>
          <div className="kpi-value">{kpis.totalDeferred}</div>
          <div className="kpi-subtitle">Unallocated eligible orders</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Capacity Blocked</div>
          <div className="kpi-value">{kpis.capacityCount}</div>
          <div className="kpi-subtitle">Weight or volume limit</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Reefer Needed</div>
          <div className="kpi-value">{kpis.reeferCount}</div>
          <div className="kpi-subtitle">No refrigerated van/truck</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Fuel Quota Blocked</div>
          <div className="kpi-value">{kpis.fuelQuotaCount}</div>
          <div className="kpi-subtitle">Weekly fuel limit reached</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Units &amp; Weight</div>
          <div className="kpi-value">{kpis.totalUnits} items</div>
          <div className="kpi-subtitle">{kpis.totalWeightKg > 0 ? `${kpis.totalWeightKg} kg total` : "—"}</div>
        </div>
      </section>

      {/* 2. Filters & Search Strip */}
      <section className="deferrals-filter-strip" aria-label="Deferral Filters">
        <div className="deferrals-filter-group">
          <input
            type="text"
            className="orders-search-input"
            placeholder="Search order ID, outlet, reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ minWidth: "260px" }}
            aria-label="Search deferrals"
          />

          <select
            className="deferrals-select"
            value={reasonFilter}
            onChange={(e) => setReasonFilter(e.target.value)}
            aria-label="Filter by deferral reason"
          >
            <option value="ALL">All Reasons</option>
            <option value="NO_CAPACITY">No Vehicle Capacity</option>
            <option value="NO_REEFER">No Reefer Available</option>
            <option value="VAN_ACCESS">Van Access Required</option>
            <option value="WINDOW_CONFLICT">Delivery Window Conflict</option>
            <option value="DEPOT_MISMATCH">Depot Mismatch</option>
            <option value="TIME_BUDGET">Driver Time Budget</option>
            <option value="FUEL_QUOTA">Weekly Fuel Quota</option>
          </select>

          <select
            className="deferrals-select"
            value={depotFilter}
            onChange={(e) => setDepotFilter(e.target.value)}
            aria-label="Filter by depot"
          >
            <option value="ALL">All Depots</option>
            <option value="Peliyagoda">Peliyagoda</option>
            <option value="Kandy">Kandy</option>
          </select>

          <select
            className="deferrals-select"
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            aria-label="Filter by category"
          >
            <option value="ALL">All Categories</option>
            <option value="Fresh">Fresh</option>
            <option value="Style">Style</option>
            <option value="Tech">Tech</option>
          </select>
        </div>

        <button
          type="button"
          className="orders-export-btn"
          onClick={handleExportCsv}
          disabled={filteredDeferrals.length === 0}
        >
          Export CSV
        </button>
      </section>

      {/* 3. Main Grid: Deferred Orders Table + Detail Panel */}
      <section className="deferrals-main-grid" aria-label="Deferral Management Grid">
        {/* Left Column: Deferred Orders List */}
        <div className="dashboard-card" style={{ padding: "20px" }}>
          <div className="card-header-row">
            <div>
              <h2 className="bottom-card-title">Deferred Orders ({filteredDeferrals.length})</h2>
              <span className="type-text">
                {operationalDate ? `Operational Date: ${operationalDate}` : "Authoritative planning outcomes"}
              </span>
            </div>
            <Link href="/dispatcher/planning" className="card-link-action">
              Go to AI Planning &gt;
            </Link>
          </div>

          <div className="orders-table-wrapper" style={{ marginTop: "14px" }}>
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Outlet &amp; District</th>
                  <th>Depot</th>
                  <th>Brand</th>
                  <th>Units / Wt</th>
                  <th>Deferral Reason</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredDeferrals.map((item) => {
                  const isSelected = selectedDeferral?.id === item.id;
                  return (
                    <tr
                      key={item.id}
                      className={`deferral-table-row ${isSelected ? "selected" : ""}`}
                      onClick={() => setSelectedDeferral(item)}
                    >
                      <td>
                        <strong>{item.deliveryId}</strong>
                      </td>
                      <td>
                        <div>{item.outlet}</div>
                        <div className="type-text">{item.district}</div>
                      </td>
                      <td>{item.depot}</td>
                      <td>{item.brand}</td>
                      <td>
                        {item.items} items
                        {item.weightKg !== "—" && <span className="type-text"> • {item.weightKg} kg</span>}
                      </td>
                      <td>
                        <span className={`deferral-reason-badge ${item.reasonInfo.badgeClass}`}>
                          {item.reasonInfo.label}
                        </span>
                      </td>
                      <td>
                        <span className="status-badge-planned">{item.status}</span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-view-route"
                          style={{ padding: "4px 10px", fontSize: "11px" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDeferral(item);
                          }}
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filteredDeferrals.length === 0 && (
                  <tr>
                    <td colSpan={8} className="empty-table-cell" style={{ textAlign: "center", padding: "36px" }}>
                      {deferrals.length === 0
                        ? "No deferred orders recorded. All eligible orders were successfully allocated in planning."
                        : "No deferred orders match the selected search or filter criteria."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Deferral Detail & Constraint Explanation */}
        <div className="dashboard-card" style={{ padding: "20px" }}>
          {selectedDeferral ? (
            <div>
              <div className="card-header-row">
                <div>
                  <h3 className="bottom-card-title">{selectedDeferral.deliveryId}</h3>
                  <span className="type-text">Unallocated Order Details</span>
                </div>
                <span className={`deferral-reason-badge ${selectedDeferral.reasonInfo.badgeClass}`}>
                  {selectedDeferral.reasonInfo.label}
                </span>
              </div>

              {/* Constraint Explanation Box */}
              <div
                className={`deferral-constraint-callout ${
                  selectedDeferral.reason === "FUEL_QUOTA"
                    ? "fuel"
                    : selectedDeferral.reason === "NO_CAPACITY"
                    ? "capacity"
                    : ""
                }`}
              >
                <div style={{ fontWeight: 700, marginBottom: "4px" }}>
                  {selectedDeferral.reasonInfo.constraint}
                </div>
                <div>{selectedDeferral.reasonInfo.description}</div>
                {selectedDeferral.reason === "FUEL_QUOTA" && (
                  <div style={{ marginTop: "6px", fontSize: "11px", fontWeight: 600 }}>
                    Note: Weekly fuel quota is a hard vehicle constraint distinct from payload weight and volume capacity.
                  </div>
                )}
              </div>

              {/^\d{4}-\d{2}-\d{2}$/.test(selectedDeferral.orderDate) &&
                isPostCutoffOrder(selectedDeferral.submittedAt, selectedDeferral.orderDate) && (
                  <div
                    className="deferral-constraint-callout"
                    style={{ borderLeftColor: "#2563eb", backgroundColor: "#eff6ff" }}
                  >
                    <strong>Cutoff boundary:</strong> This order was submitted at or after 16:00:00 Asia/Colombo on
                    the day before its operational date. It belongs to the following planning run, not an ordinary
                    capacity deferral for the current run.
                  </div>
                )}

              {/* Order Specifications */}
              <h4 className="card-subtitle-dark" style={{ marginTop: "16px", marginBottom: "8px" }}>
                Order Specifications
              </h4>
              <div className="deferral-spec-list">
                <div className="deferral-spec-item">
                  <span className="spec-label">Outlet Code</span>
                  <span className="spec-val">{selectedDeferral.outlet}</span>
                </div>
                <div className="deferral-spec-item">
                  <span className="spec-label">District</span>
                  <span className="spec-val">{selectedDeferral.district}</span>
                </div>
                <div className="deferral-spec-item">
                  <span className="spec-label">Depot</span>
                  <span className="spec-val">{selectedDeferral.depot}</span>
                </div>
                <div className="deferral-spec-item">
                  <span className="spec-label">Category / Brand</span>
                  <span className="spec-val">{selectedDeferral.brand}</span>
                </div>
                <div className="deferral-spec-item">
                  <span className="spec-label">Order Units</span>
                  <span className="spec-val">{selectedDeferral.items} units</span>
                </div>
                <div className="deferral-spec-item">
                  <span className="spec-label">Total Weight</span>
                  <span className="spec-val">{selectedDeferral.weightKg} kg</span>
                </div>
                <div className="deferral-spec-item">
                  <span className="spec-label">Total Volume</span>
                  <span className="spec-val">{selectedDeferral.volumeM3} m³</span>
                </div>
                <div className="deferral-spec-item">
                  <span className="spec-label">Temperature Req</span>
                  <span className="spec-val">
                    {selectedDeferral.temperature ? selectedDeferral.temperature.toUpperCase() : "—"}
                  </span>
                </div>
                <div className="deferral-spec-item">
                  <span className="spec-label">Operational Date</span>
                  <span className="spec-val">{selectedDeferral.orderDate}</span>
                </div>
                <div className="deferral-spec-item">
                  <span className="spec-label">Reported Timestamp</span>
                  <span className="spec-val">{selectedDeferral.reportedAt}</span>
                </div>
              </div>

              {/* Operational Next Steps */}
              <h4 className="card-subtitle-dark" style={{ marginTop: "18px", marginBottom: "8px" }}>
                Operational Follow-up
              </h4>
              <p className="kpi-subtitle" style={{ fontSize: "12px", lineHeight: "1.4" }}>
                This order remains unallocated in the current planning run. To re-evaluate allocation feasibility with adjusted fleet capacity or fuel quotas, return to AI Planning.
              </p>

              <div className="deferral-action-buttons">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => router.push("/dispatcher/planning")}
                >
                  Review in AI Planning
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => router.push("/dispatcher/orders")}
                >
                  View in Orders Management
                </button>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "40px" }}>
              <p className="kpi-subtitle">Select a deferred order from the table to inspect details and planning constraints.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
