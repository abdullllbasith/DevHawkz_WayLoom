"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  classifyExceptionCategory,
  computeExceptionsKpis,
  exportExceptionsCsv,
  filterExceptionsList,
  readExceptionList,
  validateCreateExceptionInput,
  type StoredException,
} from "../../../lib/dispatcher-exceptions";
import { shortId } from "../../../lib/short-id";

export default function DispatcherExceptionsPage() {
  const router = useRouter();

  const [exceptions, setExceptions] = useState<StoredException[]>([]);
  const [selectedException, setSelectedException] = useState<StoredException | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");

  // Modal State for Record Exception
  const [modalOpen, setModalOpen] = useState(false);
  const [categoryPreset, setCategoryPreset] = useState("loading problem");
  const [customCategory, setCustomCategory] = useState("");
  const [formDetails, setFormDetails] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function resolvedExceptionCategory(): string {
    if (categoryPreset === "custom") return customCategory.trim();
    return categoryPreset;
  }

  async function loadExceptions() {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/exceptions", { cache: "no-store" });

      if (response.status === 401 || response.status === 403) {
        setError("Authorization failure: You do not have permission to view Dispatcher exceptions.");
        setLoading(false);
        return;
      }

      if (!response.ok) {
        setError("Unable to load operational exceptions from the server. No substitute figures are shown.");
        setLoading(false);
        return;
      }

      const payload: unknown = await response.json().catch(() => null);
      const parsed = readExceptionList(payload);

      setExceptions(parsed);
      setSelectedException((prev) => {
        if (!prev) return parsed[0] ?? null;
        return parsed.find((e) => e.id === prev.id) ?? parsed[0] ?? null;
      });
      setLoading(false);
    } catch {
      setError("Operational exceptions could not be retrieved due to a network connection error.");
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadExceptions();
  }, []);

  const filtered = filterExceptionsList(exceptions, {
    search,
    categoryGroup: categoryFilter,
  });

  const kpis = computeExceptionsKpis(exceptions);

  function handleExportCsv() {
    const csv = exportExceptionsCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `wayloom-exceptions-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleRecordException(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const validation = validateCreateExceptionInput(resolvedExceptionCategory(), formDetails);
    if (!validation.ok) {
      setFormError(validation.error);
      return;
    }

    setFormSubmitting(true);
    try {
      let csrfToken = "";
      const csrfResponse = await fetch("/api/auth/csrf");
      if (csrfResponse.ok) {
        const csrfData = (await csrfResponse.json()) as { csrfToken?: string };
        csrfToken = csrfData.csrfToken ?? "";
      }

      const response = await fetch("/api/exceptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-wayloom-csrf": csrfToken } : {}),
        },
        body: JSON.stringify({
          category: validation.category,
          ...(validation.details ? { details: validation.details } : {}),
        }),
      });

      if (!response.ok) {
        const resBody = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
        setFormError(resBody.error?.message ?? "Failed to record exception. Please verify inputs.");
        setFormSubmitting(false);
        return;
      }

      const created: unknown = await response.json().catch(() => null);
      setModalOpen(false);
      setFormDetails("");
      setCategoryPreset("loading problem");
      setCustomCategory("");
      setFormSubmitting(false);

      // Refresh list
      await loadExceptions();
      if (typeof created === "object" && created !== null && "id" in created && typeof created.id === "string") {
        const createdId = created.id;
        setSelectedException({
          id: createdId,
          category: validation.category,
          details: validation.details ?? null,
          occurredAt: new Date().toISOString(),
        });
      }
    } catch {
      setFormError("Connection error while submitting exception.");
      setFormSubmitting(false);
    }
  }

  if (loading && exceptions.length === 0) {
    return (
      <div className="exceptions-page-container">
        <div className="dashboard-card" style={{ padding: "40px", textAlign: "center" }}>
          <p className="kpi-subtitle">Loading operational exceptions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="exceptions-page-container">
      {error && (
        <div className="dashboard-error" role="alert">
          <span>{error}</span>
        </div>
      )}

      {/* 1. Top KPI Summary Cards */}
      <section className="exceptions-kpi-grid" aria-label="Operational Exceptions Metrics">
        <div className="kpi-card">
          <div className="kpi-label">Total Exceptions</div>
          <div className="kpi-value">{kpis.totalExceptions}</div>
          <div className="kpi-subtitle">Recorded in system</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Loading Issues</div>
          <div className="kpi-value">{kpis.loadingCount}</div>
          <div className="kpi-subtitle">Dock &amp; shortfall alerts</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Vehicle &amp; Fleet</div>
          <div className="kpi-value">{kpis.vehicleCount}</div>
          <div className="kpi-subtitle">Breakdowns &amp; maintenance</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Delivery Access</div>
          <div className="kpi-value">{kpis.deliveryCount}</div>
          <div className="kpi-subtitle">Outlet access &amp; gates</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Operational Review</div>
          <div className="kpi-value">Manual</div>
          <div className="kpi-subtitle">Dispatcher decision-maker</div>
        </div>
      </section>

      {/* 2. Filters & Action Strip */}
      <section className="deferrals-filter-strip" aria-label="Exception Filters and Actions">
        <div className="deferrals-filter-group">
          <input
            type="text"
            className="orders-search-input"
            placeholder="Search exception ID, category, details..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ minWidth: "280px" }}
            aria-label="Search exceptions"
          />

          <select
            className="deferrals-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by exception category"
          >
            <option value="ALL">All Categories</option>
            <option value="loading">Loading Issues</option>
            <option value="vehicle">Vehicle &amp; Fleet</option>
            <option value="delivery">Delivery Access</option>
            <option value="delay">Traffic &amp; Delay</option>
            <option value="cargo">Cargo &amp; Quality</option>
            <option value="other">Other Operational</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            type="button"
            className="orders-export-btn"
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
          >
            Export CSV
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setModalOpen(true)}
            style={{ padding: "8px 16px", fontSize: "13px" }}
          >
            + Record Exception
          </button>
        </div>
      </section>

      {/* 3. Main Grid: Exceptions Table + Detail Panel */}
      <section className="deferrals-main-grid" aria-label="Operational Exceptions List and Details">
        {/* Left Column: Exceptions Table */}
        <div className="dashboard-card" style={{ padding: "20px" }}>
          <div className="card-header-row">
            <div>
              <h2 className="bottom-card-title">Recorded Exceptions ({filtered.length})</h2>
              <span className="type-text">Authoritative operational issue log</span>
            </div>
            <Link href="/dispatcher" className="card-link-action">
              Go to Dashboard &gt;
            </Link>
          </div>

          <div className="orders-table-wrapper" style={{ marginTop: "14px" }}>
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Exception ID</th>
                  <th>Category</th>
                  <th>Details</th>
                  <th>Occurred At</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const isSelected = selectedException?.id === item.id;
                  const info = classifyExceptionCategory(item.category);
                  return (
                    <tr
                      key={item.id}
                      className={`deferral-table-row ${isSelected ? "selected" : ""}`}
                      onClick={() => setSelectedException(item)}
                    >
                      <td>
                        <strong title={item.id}>{shortId(item.id)}</strong>
                      </td>
                      <td>
                        <span className={`deferral-reason-badge ${info.badgeClass}`}>
                          {item.category}
                        </span>
                      </td>
                      <td>
                        <div style={{ maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.details ?? "—"}
                        </div>
                      </td>
                      <td>
                        <span className="type-text">{item.occurredAt.slice(0, 19).replace("T", " ")}</span>
                      </td>
                      <td>
                        <span className="status-badge-planned">Reported</span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-view-route"
                          style={{ padding: "4px 10px", fontSize: "11px" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedException(item);
                          }}
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty-table-cell" style={{ textAlign: "center", padding: "36px" }}>
                      {exceptions.length === 0
                        ? "No operational exceptions recorded in the system. The delivery and planning pipeline is operating without reported issues."
                        : "No operational exceptions match the selected search or category filter criteria."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Selected Exception Detail */}
        <div className="dashboard-card" style={{ padding: "20px" }}>
          {selectedException ? (
            <div>
              <div className="card-header-row">
                <div>
                  <h3 className="bottom-card-title" title={selectedException.id}>{shortId(selectedException.id)}</h3>
                  <span className="type-text">Operational Exception Detail</span>
                </div>
                <span className={`deferral-reason-badge ${classifyExceptionCategory(selectedException.category).badgeClass}`}>
                  {selectedException.category}
                </span>
              </div>

              {/* Detail Callout */}
              <div className="deferral-constraint-callout" style={{ borderLeftColor: "#dc2626", backgroundColor: "#fef2f2" }}>
                <div style={{ fontWeight: 700, marginBottom: "4px", color: "#991b1b" }}>
                  {classifyExceptionCategory(selectedException.category).label}
                </div>
                <div>{selectedException.details ?? "No additional descriptive details provided with this report."}</div>
              </div>

              {/* Exception Specifications */}
              <h4 className="card-subtitle-dark" style={{ marginTop: "16px", marginBottom: "8px" }}>
                Operational Context
              </h4>
              <div className="deferral-spec-list">
                <div className="deferral-spec-item">
                  <span className="spec-label">Status</span>
                  <span className="spec-val">Reported</span>
                </div>
                <div className="deferral-spec-item">
                  <span className="spec-label">Occurred At</span>
                  <span className="spec-val">{selectedException.occurredAt.slice(0, 19).replace("T", " ")}</span>
                </div>
                <div className="deferral-spec-item">
                  <span className="spec-label">Category Group</span>
                  <span className="spec-val">{classifyExceptionCategory(selectedException.category).label}</span>
                </div>
                <div className="deferral-spec-item">
                  <span className="spec-label">Affected Entity</span>
                  <span className="spec-val" title="Context foreign keys are unapproved in schema">—</span>
                </div>
                <div className="deferral-spec-item">
                  <span className="spec-label">Priority / Severity</span>
                  <span className="spec-val" title="No priority score is fabricated">—</span>
                </div>
                <div className="deferral-spec-item">
                  <span className="spec-label">AI Decision-Making</span>
                  <span className="spec-val" title="Resolution is human Dispatcher responsibility">Disabled</span>
                </div>
              </div>

              {/* Follow-up Navigation */}
              <h4 className="card-subtitle-dark" style={{ marginTop: "18px", marginBottom: "8px" }}>
                Operational Workflows
              </h4>
              <p className="kpi-subtitle" style={{ fontSize: "12px", lineHeight: "1.4" }}>
                Investigate and handle operational context across related Dispatcher workspaces:
              </p>

              <div className="deferral-action-buttons">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => router.push("/dispatcher/planning")}
                >
                  Review AI Planning &amp; Allocation
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => router.push("/dispatcher/routes")}
                >
                  Inspect Routes Management
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => router.push("/dispatcher/orders")}
                >
                  Inspect Orders Management
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => router.push("/dispatcher/deferrals")}
                >
                  Inspect Deferral Management
                </button>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "40px" }}>
              <p className="kpi-subtitle">Select an exception from the table to inspect details and operational context.</p>
            </div>
          )}
        </div>
      </section>

      {/* 4. Record Exception Modal */}
      {modalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-box">
            <div className="modal-header">
              <h3 id="modal-title" className="modal-title">Record Operational Exception</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setModalOpen(false)}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRecordException}>
              <div className="modal-body">
                {formError && (
                  <div className="dashboard-error" role="alert" style={{ marginBottom: "8px" }}>
                    <span>{formError}</span>
                  </div>
                )}

                <div className="modal-form-group">
                  <label htmlFor="modal-category-select" className="modal-label">
                    Category *
                  </label>
                  <select
                    id="modal-category-select"
                    className="modal-input"
                    value={categoryPreset}
                    onChange={(e) => setCategoryPreset(e.target.value)}
                  >
                    <option value="loading problem">Loading Problem (shortfall, dock issue)</option>
                    <option value="vehicle breakdown">Vehicle Breakdown (engine, tire, battery)</option>
                    <option value="delivery access issue">Delivery Access Issue (gate locked, refused)</option>
                    <option value="damaged goods">Damaged Goods (packaging, carton crushed)</option>
                    <option value="traffic delay">Traffic &amp; Weather Delay</option>
                    <option value="documentation discrepancy">Documentation Discrepancy</option>
                    <option value="custom">Other (Custom category below)</option>
                  </select>
                </div>

                {categoryPreset === "custom" && (
                  <div className="modal-form-group">
                    <label htmlFor="modal-custom-category" className="modal-label">
                      Custom Category Description *
                    </label>
                    <input
                      id="modal-custom-category"
                      type="text"
                      className="modal-input"
                      placeholder="e.g. cold room failure"
                      value={customCategory}
                      onChange={(e) => setCustomCategory(e.target.value)}
                      required
                    />
                  </div>
                )}

                <div className="modal-form-group">
                  <label htmlFor="modal-details" className="modal-label">
                    Details (Optional)
                  </label>
                  <textarea
                    id="modal-details"
                    className="modal-textarea"
                    placeholder="Provide specific operational details, affected area, or notes..."
                    value={formDetails}
                    onChange={(e) => setFormDetails(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setModalOpen(false)}
                  disabled={formSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={formSubmitting}
                >
                  {formSubmitting ? "Recording..." : "Record Exception"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
