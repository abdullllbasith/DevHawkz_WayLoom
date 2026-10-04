"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandLogo } from "../brand-logo";
import { activeStoreHref, storeNavigation } from "../../lib/store-shell";
import { NotificationBell } from "../notification-bell";
import { DispatcherLogout } from "../dispatcher/logout";

export function StoreFrame({
  displayName,
  children,
}: {
  displayName: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active = activeStoreHref(pathname);
  const current = storeNavigation.find((item) => item.href === active);
  const title = current?.label ?? "Store Dashboard";
  const subtitle = subtitleFor(active);
  const crumb = current && current.href !== "/store" ? `Deliveries > ${current.label}` : "Dashboard";

  return (
    <div className="store-shell">
      <aside className="store-side">
        <div className="store-brand">
          <BrandLogo />
        </div>
        <nav aria-label="Store Manager">
          {storeNavigation.map((item) => {
            const isActive = item.href === active;
            return (
              <Link key={item.href} href={item.href} aria-current={isActive ? "page" : undefined}>
                <span className="store-nav-icon" aria-hidden="true">{navIcon(item.href)}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="store-help">
          <p>Need help?</p>
          <span>No guide is connected for this workspace.</span>
          <button type="button" disabled>View Guide</button>
        </div>
      </aside>
      <div className="store-body">
        <header className="store-top">
          <div>
            <p className="store-crumb">{crumb}</p>
            <h1>{title}</h1>
            <p className="store-sub">{subtitle}</p>
          </div>
          <div className="store-tools">
            <p className="store-date" suppressHydrationWarning>{calendarDate()}</p>
            <NotificationBell role="store" />
            <div className="store-identity">
              <span className="store-avatar" aria-hidden="true">{initials(displayName)}</span>
              <span>
                <strong>{displayName}</strong>
                <span>Store Manager</span>
              </span>
            </div>
            <DispatcherLogout />
          </div>
        </header>
        <main className="store-main">{children}</main>
      </div>
      <nav className="store-nav" aria-label="Store Manager">
        {storeNavigation.map((item) => {
          const isActive = item.href === active;
          return (
            <Link key={item.href} href={item.href} aria-current={isActive ? "page" : undefined}>
              {shortLabel(item.label)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function subtitleFor(active: string | null): string {
  if (active === "/store/orders") return "Orders that are not receipt confirmed.";
  if (active === "/store/receipts") return "Receipt confirmed orders, and confirmation for a delivered order.";
  if (active === "/store/orders/new") return "Submit an order for an assigned outlet.";
  return "Orders for the outlets assigned to this account.";
}

function shortLabel(label: string): string {
  if (label === "Store Dashboard") return "Dashboard";
  if (label === "Pending Deliveries") return "Pending";
  if (label === "Received Deliveries") return "Received";
  return "Create";
}

function calendarDate(): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Colombo",
  }).format(new Date());
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((part) => part.length > 0);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function navIcon(href: string) {
  if (href === "/store") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 10v10h14V10" />
      </svg>
    );
  }
  if (href === "/store/orders") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M8 9h8M8 13h5" />
      </svg>
    );
  }
  if (href === "/store/receipts") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
