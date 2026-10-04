"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { activeLoaderHref, loaderNavigation } from "../../lib/loader-shell";
import { DispatcherLogout } from "../dispatcher/logout";

export function LoaderFrame({
  apiOrigin,
  displayName,
  children,
}: {
  apiOrigin: string;
  displayName: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active = activeLoaderHref(pathname);
  const current = loaderNavigation.find((item) => item.href === active);
  const title = current?.label ?? "Dashboard";
  const subtitle =
    active === "/loader/loading"
      ? "Verify the loaded quantity for a confirmed stop"
      : active === "/loader/checklist"
        ? "Verified quantity compared with the expected quantity"
        : active === "/loader/records"
          ? "Loading records created by verification"
          : "Confirmed stops waiting for this Loader";

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
        <nav className="dispatcher-nav" aria-label="Loader">
          {loaderNavigation.map((item) => {
            const isActive = item.href === active;
            return (
              <Link key={item.href} href={item.href} className={`dispatcher-nav-link ${isActive ? "active" : ""}`} aria-current={isActive ? "page" : undefined}>
                <span className="dispatcher-nav-icon" aria-hidden="true">{navIcon(item.label)}</span>
                <span className="dispatcher-nav-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="dispatcher-sidebar-footer loader-sidebar-footer">
          <DispatcherLogout apiOrigin={apiOrigin} />
        </div>
      </aside>
      <div className="dispatcher-main">
        <header className="dispatcher-header">
          <div className="dispatcher-header-left">
            <input id="loader-menu" className="dispatcher-menu" type="checkbox" aria-label="Show Loader navigation" />
            <div className="dispatcher-header-title-block">
              <span className="dispatcher-breadcrumb">Loader{current && current.href !== "/loader" ? ` > ${current.label}` : ""}</span>
              <h1 className="dispatcher-greeting">{title}</h1>
              <span className="dispatcher-date-sub">{subtitle}</span>
            </div>
          </div>
          <div className="dispatcher-header-right">
            <div className="dispatcher-user-profile" aria-label={`User profile for ${displayName}`}>
              <div className="dispatcher-avatar" aria-hidden="true">{initials(displayName)}</div>
              <div className="dispatcher-user-meta">
                <span className="dispatcher-user-name">{displayName || "—"}</span>
                <span className="dispatcher-user-role">Loader</span>
              </div>
            </div>
          </div>
        </header>
        <main className="dispatcher-content">{children}</main>
      </div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((part) => part.length > 0);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function navIcon(label: string) {
  if (label === "Dashboard") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    );
  }
  if (label === "Loading") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="1" y="3" width="15" height="13" />
        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
        <circle cx="5.5" cy="18.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    );
  }
  if (label === "Checklist") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
