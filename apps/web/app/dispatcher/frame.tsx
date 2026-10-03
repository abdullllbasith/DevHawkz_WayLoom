"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { activeDispatcherHref, dispatcherNavigation } from "../../lib/dispatcher-shell";
import { DispatcherLogout } from "./logout";

export function DispatcherFrame({
  apiOrigin,
  displayName,
  children,
}: {
  apiOrigin: string;
  displayName: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active = activeDispatcherHref(pathname);

  const isOrdersPage = pathname.startsWith("/dispatcher/orders");
  const isPlanningPage = pathname.startsWith("/dispatcher/planning");
  const isAllocationConfirmationPage = pathname.startsWith("/dispatcher/allocation-confirmation");
  const isDashboardPage = pathname === "/dispatcher";

  let breadcrumb = "Dashboard";
  let title = "Good evening, Dispatcher";
  let subtitle = "Operational overview";
  let dateText = "Planning date from orders";

  if (isAllocationConfirmationPage) {
    breadcrumb = "Dispatcher > AI Planning > AI Planning Results > Approved";
    title = "AI Planning Results";
    subtitle = "Review the planning result and confirm the delivery plan";
    dateText = "Operational date";
  } else if (isPlanningPage) {
    breadcrumb = "Dispatcher > AI Planning > AI Planning Results";
    title = "AI Planning Results";
    subtitle = "Review the planning result and confirm the delivery plan";
    dateText = "Operational date";
  } else if (isOrdersPage) {
    breadcrumb = "Dispatcher > Orders > All Orders";
    title = "Orders";
    subtitle = "View orders for delivery planning.";
    dateText = "Operational date";
  } else if (!isDashboardPage) {
    const matched = dispatcherNavigation.find((i) => i.href === active);
    breadcrumb = `Dispatcher > ${matched?.label ?? "Workspace"}`;
    title = matched?.label ?? "Dispatcher";
    subtitle = "Operations Workspace";
    dateText = "Dispatcher";
  }

  return (
    <div className="dispatcher-shell">
      <aside className="dispatcher-sidebar">
        <div className="dispatcher-brand">
          <div className="dispatcher-logo-icon" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <polygon points="14,2 18,8 14,14 10,8" fill="#0F172A" />
              <polygon points="26,14 20,18 14,14 20,10" fill="#0F172A" />
              <polygon points="14,26 10,20 14,14 18,20" fill="#0F172A" />
              <polygon points="2,14 8,10 14,14 8,18" fill="#0F172A" />
              <circle cx="14" cy="14" r="2" fill="#2563EB" />
            </svg>
          </div>
          <span className="dispatcher-brand-name">WayLoom</span>
        </div>

        <nav className="dispatcher-nav" aria-label="Dispatcher">
          {dispatcherNavigation.map((item) => {
            const isActive = item.href === active;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`dispatcher-nav-link ${isActive ? "active" : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                <span className="dispatcher-nav-icon" aria-hidden="true">
                  {navIcon(item.label)}
                </span>
                <span className="dispatcher-nav-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="dispatcher-help-card">
          <p className="dispatcher-help-title">Need Help?</p>
          <p className="dispatcher-help-sub">Read guides &amp; documentation</p>
          <button type="button" className="dispatcher-help-btn" onClick={() => window.open("/docs", "_blank")}>
            View Guide
          </button>
        </div>

        <div className="dispatcher-sidebar-footer">
          <DispatcherLogout apiOrigin={apiOrigin} />
        </div>
      </aside>

      <div className="dispatcher-main">
        <header className="dispatcher-header">
          <div className="dispatcher-header-left">
            <input
              id="dispatcher-menu"
              className="dispatcher-menu"
              type="checkbox"
              aria-label="Show Dispatcher navigation"
            />
            <div className="dispatcher-header-title-block">
              <span className="dispatcher-breadcrumb">{breadcrumb}</span>
              <h1 className="dispatcher-greeting">{title}</h1>
              <span className="dispatcher-date-sub">{subtitle}</span>
            </div>
          </div>

          <div className="dispatcher-header-right">
            <div className="dispatcher-search-bar">
              <svg className="dispatcher-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className="dispatcher-search-input"
                placeholder="Search orders, outlets, items..."
                aria-label="Search orders, outlets, items"
              />
            </div>

            <button type="button" className="dispatcher-date-btn" aria-label={dateText} disabled>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>{dateText}</span>
            </button>

            <button type="button" className="dispatcher-icon-btn" aria-label="Notifications">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>

            <div className="dispatcher-user-profile" aria-label={`User profile for ${displayName}`}>
              <div className="dispatcher-avatar" aria-hidden="true">
                {avatarInitials(displayName)}
              </div>
              <div className="dispatcher-user-meta">
                <span className="dispatcher-user-name">{displayName || "—"}</span>
                <span className="dispatcher-user-role">Dispatcher</span>
              </div>
            </div>
          </div>
        </header>

        <main className="dispatcher-content">{children}</main>
      </div>
    </div>
  );
}

function avatarInitials(name: string): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0]?.substring(0, 2) ?? "JK").toUpperCase();
  return `${parts[0]?.[0] ?? "J"}${parts[parts.length - 1]?.[0] ?? "K"}`.toUpperCase();
}

function navIcon(label: string) {
  switch (label) {
    case "Dashboard":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      );
    case "Orders":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      );
    case "AI Planning":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
        </svg>
      );
    case "Vehicles":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="3" width="15" height="13" />
          <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
      );
    case "Routes":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="19" r="3" />
          <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
          <circle cx="18" cy="5" r="3" />
        </svg>
      );
    case "Workflow":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      );
    case "Analytics":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      );
    case "Reports":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
    case "Settings":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.77 1.05 1.41 1.2H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
    case "Deferrals":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    case "Exceptions":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    default:
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
  }
}
