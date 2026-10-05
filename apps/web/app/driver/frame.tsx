"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandLogo } from "../brand-logo";
import { activeDriverHref, driverNavigation } from "../../lib/driver-shell";
import { DriverLinkStatus } from "./link-status";
import { NotificationBell } from "../notification-bell";
import { DispatcherLogout } from "../dispatcher/logout";

export function DriverFrame({
  displayName,
  children,
}: {
  displayName: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  useEffect(() => {
    const menu = document.getElementById("driver-menu");
    if (menu instanceof HTMLInputElement) menu.checked = false;
  }, [pathname]);
  const active = activeDriverHref(pathname);
  const current = driverNavigation.find((item) => item.href === active);
  const title = current?.label ?? "My Routes";
  const subtitle =
    active === "/driver/stops"
      ? "Stop order stays the planned sequence"
      : active === "/driver/outcome"
        ? "Record the delivery result for one stop"
        : active === "/driver/pod"
          ? "Store an evidence reference for one stop"
          : "Trips assigned to this driver";

  return (
    <div className="dispatcher-shell driver-app">
      <aside className="dispatcher-sidebar">
        <div className="dispatcher-brand">
          <BrandLogo />
        </div>
        <nav className="dispatcher-nav" aria-label="Driver">
          {driverNavigation.map((item) => {
            const isActive = item.href === active;
            return (
              <Link key={item.href} href={item.href} className={`dispatcher-nav-link ${isActive ? "active" : ""}`} aria-current={isActive ? "page" : undefined}>
                <span className="dispatcher-nav-icon" aria-hidden="true">{navIcon(item.href)}</span>
                <span className="dispatcher-nav-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="dispatcher-main">
        <header className="dispatcher-header">
          <div className="dispatcher-header-left">
            <input id="driver-menu" className="dispatcher-menu" type="checkbox" aria-label="Show Driver navigation" />
            <div className="dispatcher-header-title-block">
              <span className="dispatcher-breadcrumb">Driver{current && current.href !== "/driver" ? ` > ${current.label}` : ""}</span>
              <h1 className="dispatcher-greeting">{title}</h1>
              <span className="dispatcher-date-sub">{subtitle}</span>
            </div>
          </div>
          <div className="dispatcher-header-right">
            <DriverLinkStatus />
            <NotificationBell role="driver" />
            <div className="dispatcher-user-profile" aria-label={`User profile for ${displayName}`}>
              <div className="dispatcher-avatar" aria-hidden="true">{initials(displayName)}</div>
              <div className="dispatcher-user-meta">
                <span className="dispatcher-user-name">{displayName || "—"}</span>
                <span className="dispatcher-user-role">Driver</span>
              </div>
            </div>
            <DispatcherLogout />
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

function navIcon(href: string) {
  if (href === "/driver") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="6" cy="19" r="2" />
        <circle cx="18" cy="19" r="2" />
        <path d="M4 15h12l2-6H7" />
        <path d="M8 15V9" />
      </svg>
    );
  }
  if (href === "/driver/stops") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z" />
        <circle cx="12" cy="10" r="2" />
      </svg>
    );
  }
  if (href === "/driver/outcome") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 11l3 3L22 4" />
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
