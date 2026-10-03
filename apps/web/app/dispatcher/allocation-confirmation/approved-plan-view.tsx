"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  defaultApprovedCards,
  defaultApprovedPlanMetadata,
  defaultLoaderNotificationChecklist,
  defaultNextStepsList,
  getApprovedDeferredOrders,
  getApprovedVehicleAssignments,
  type ApprovedPlanMetadata,
} from "../../../lib/dispatcher-confirmation";

export function ApprovedPlanView({
  metadata = defaultApprovedPlanMetadata,
}: {
  metadata?: ApprovedPlanMetadata;
}) {
  const router = useRouter();
  const vehicles = getApprovedVehicleAssignments();
  const deferredOrders = getApprovedDeferredOrders();

  return (
    <div className="approved-page-container">
      {/* 1. Green Delivery Plan Approved Banner */}
      <section className="plan-approved-banner" role="region" aria-label="Approval Notification">
        <div className="approved-banner-left">
          <div className="approved-icon-circle" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div>
            <h2 className="approved-banner-title">Delivery Plan Approved!</h2>
            <p className="approved-banner-sub">
              The optimized delivery plan has been successfully approved and sent to the warehouse loading team.
            </p>
          </div>
        </div>

        <div className="approved-banner-right">
          <div className="approved-meta-item">
            <span className="meta-label">Plan ID</span>
            <span className="meta-val">{metadata.planId}</span>
          </div>
          <div className="approved-meta-item">
            <span className="meta-label">Approved by</span>
            <span className="meta-val">{metadata.approvedBy}</span>
          </div>
          <div className="approved-meta-item">
            <span className="meta-label">Approved at</span>
            <span className="meta-val">{metadata.approvedAt}</span>
          </div>
        </div>
      </section>

      {/* 2. Four Summary KPI Cards */}
      <section className="approved-kpi-grid" aria-label="Plan Overview Summary">
        {defaultApprovedCards.map((card) => (
          <div key={card.id} className="approved-kpi-card">
            <div className="approved-kpi-left">
              <div className={`approved-kpi-icon-box ${card.icon}`} aria-hidden="true">
                {card.icon === "vehicle" && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="3" width="15" height="13" />
                    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                    <circle cx="5.5" cy="18.5" r="2.5" />
                    <circle cx="18.5" cy="18.5" r="2.5" />
                  </svg>
                )}
                {card.icon === "orders" && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                    <line x1="12" y1="22.08" x2="12" y2="12" />
                  </svg>
                )}
                {card.icon === "clock" && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                )}
                {card.icon === "fuel" && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 22h12V4H3z" />
                    <path d="M15 10l4-2v8l-4 2" />
                    <circle cx="9" cy="10" r="2" />
                  </svg>
                )}
              </div>
              <div className="approved-kpi-text-block">
                <div className="approved-kpi-count">{card.count}</div>
                <div className="approved-kpi-label">{card.label}</div>
                <div className={`approved-kpi-pill ${card.pillVariant}`}>
                  {card.pillText}
                </div>
              </div>
            </div>
            <span className="approved-kpi-chevron" aria-hidden="true">›</span>
          </div>
        ))}
      </section>

      {/* 3. Middle Section: Vehicle Assignments Summary + Loader Notification */}
      <section className="approved-middle-grid" aria-label="Vehicle Assignments and Loader Notification">
        {/* Left: Vehicle Assignments Summary Table */}
        <div className="dashboard-card approved-card">
          <div className="card-header-row">
            <div className="card-title-with-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="1" y="3" width="15" height="13" />
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                <circle cx="5.5" cy="18.5" r="2.5" />
                <circle cx="18.5" cy="18.5" r="2.5" />
              </svg>
              <h3 className="bottom-card-title">Vehicle Assignments Summary</h3>
            </div>
            <Link href="/dispatcher/planning" className="card-link-action">
              View All →
            </Link>
          </div>

          <div className="approved-table-wrapper">
            <table className="orders-table approved-table" aria-label="Vehicle Assignments Summary">
              <thead>
                <tr>
                  <th scope="col">Vehicle ID</th>
                  <th scope="col">Type</th>
                  <th scope="col">Driver</th>
                  <th scope="col">Orders</th>
                  <th scope="col">Load (kg)</th>
                  <th scope="col">Route</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <div className="vehicle-id-cell">
                        <span className="vehicle-id-icon" aria-hidden="true">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2">
                            <rect x="1" y="3" width="15" height="13" />
                            <polygon points="16 8 20 8 23 11 23 16 16 16 8" />
                            <circle cx="5.5" cy="18.5" r="2.5" />
                            <circle cx="18.5" cy="18.5" r="2.5" />
                          </svg>
                        </span>
                        <span className="vehicle-code-text">{v.vehicleId}</span>
                      </div>
                    </td>
                    <td><span className="type-text">{v.type}</span></td>
                    <td>
                      <div className="driver-cell">
                        <span
                          className={`driver-status-dot ${v.driverOnline ? "online" : "offline"}`}
                          aria-label={v.driverOnline ? "Online" : "Offline"}
                        />
                        <span className="driver-name-text">{v.driver}</span>
                      </div>
                    </td>
                    <td><span className="orders-count-text">{v.ordersCount}</span></td>
                    <td>
                      <div className="load-cell">
                        <span className={`load-weight-text ${v.loadPercent >= 100 ? "full-load" : ""}`}>
                          {v.currentLoadKg.toLocaleString()} / {v.capacityKg.toLocaleString()}
                        </span>
                        <div className="load-progress-track">
                          <div
                            className={`load-progress-fill ${v.loadPercent >= 100 ? "danger" : "normal"}`}
                            style={{ width: `${Math.min(v.loadPercent, 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td><span className="route-badge-pill">{v.routeId}</span></td>
                    <td><span className="status-badge-assigned">Assigned</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Loader Notification Panel */}
        <div className="dashboard-card approved-card loader-card">
          <div className="card-header-row">
            <div className="card-title-with-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <h3 className="bottom-card-title">Loader Notification</h3>
            </div>
            <span className="loader-sent-badge">
              <span className="loader-sent-dot" aria-hidden="true" />
              Sent
            </span>
          </div>

          <div className="loader-info-box">
            <div className="warehouse-icon-box" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2">
                <path d="M3 21V9l9-6 9 6v12" />
                <path d="M9 21V13h6v8" />
              </svg>
            </div>
            <p className="loader-info-text">
              Loading manifests have been generated and sent to the warehouse team.
            </p>
          </div>

          <ul className="loader-checklist" aria-label="Warehouse notification checklist">
            {defaultLoaderNotificationChecklist.map((item, idx) => (
              <li key={idx} className="loader-check-item">
                <span className="loader-check-icon" aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <span className="loader-check-text">{item}</span>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="btn-view-manifest"
            onClick={() => alert("Loading manifests are available for warehouse dispatch.")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <span>View Loading Manifest →</span>
          </button>
        </div>
      </section>

      {/* 4. Bottom Section: Deferred Orders (3) + Next Steps */}
      <section className="approved-bottom-grid" aria-label="Deferred Orders and Next Steps">
        {/* Left: Deferred Orders Table */}
        <div className="dashboard-card approved-card">
          <div className="card-header-row">
            <div className="card-title-with-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7.5" r="4" />
                <polyline points="17 11 19 13 23 9" />
              </svg>
              <h3 className="bottom-card-title">Deferred Orders ({deferredOrders.length})</h3>
            </div>
            <Link href="/dispatcher/deferrals" className="card-link-action">
              View All →
            </Link>
          </div>

          <div className="approved-table-wrapper">
            <table className="orders-table approved-table" aria-label="Deferred Orders list">
              <thead>
                <tr>
                  <th scope="col">Order ID</th>
                  <th scope="col">Outlet</th>
                  <th scope="col">Category</th>
                  <th scope="col">Reason for Deferral</th>
                  <th scope="col">Priority</th>
                  <th scope="col">Suggested Action</th>
                </tr>
              </thead>
              <tbody>
                {deferredOrders.map((d) => (
                  <tr key={d.id}>
                    <td><span className="order-id-mono">{d.orderId}</span></td>
                    <td><span className="outlet-name-text">{d.outlet}</span></td>
                    <td><span className="category-text">{d.category}</span></td>
                    <td><span className="reason-text">{d.reasonForDeferral}</span></td>
                    <td>
                      <span className={`priority-badge priority-${d.priority.toLowerCase()}`}>
                        {d.priority}
                      </span>
                    </td>
                    <td><span className="action-text">{d.suggestedAction}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Next Steps Timeline */}
        <div className="dashboard-card approved-card next-steps-card">
          <div className="card-header-row">
            <div className="card-title-with-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              <h3 className="bottom-card-title">Next Steps</h3>
            </div>
            <button
              type="button"
              className="btn-return-dashboard"
              onClick={() => router.push("/dispatcher")}
            >
              ← Return to Dashboard
            </button>
          </div>

          <div className="next-steps-timeline">
            {defaultNextStepsList.map((item) => (
              <div key={item.step} className="timeline-step-row">
                <div className={`step-circle ${item.isCurrent ? "current" : "future"}`}>
                  {item.step}
                </div>
                <div className="step-content">
                  <div className="step-title-line">
                    <span className="step-title">{item.title}</span>
                    {item.statusBadge && (
                      <span className="step-status-pill">{item.statusBadge}</span>
                    )}
                    {item.timeBadge && (
                      <span className="step-time-pill">{item.timeBadge}</span>
                    )}
                    {item.subtitle && (
                      <span className="step-subtitle-inline">{item.subtitle}</span>
                    )}
                  </div>
                  <p className="step-desc">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
