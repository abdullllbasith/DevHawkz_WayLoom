"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { activeStoreHref, storeNavigation } from "../../lib/store-shell";
import { DispatcherLogout } from "../dispatcher/logout";

export function StoreFrame({
  apiOrigin,
  displayName,
  children,
}: {
  apiOrigin: string;
  displayName: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active = activeStoreHref(pathname);
  const current = storeNavigation.find((item) => item.href === active);

  return (
    <div className="store-shell">
      <aside className="store-side">
        <p className="store-brand">WayLoom</p>
        <nav aria-label="Store Manager">
          {storeNavigation.map((item) => {
            const isActive = item.href === active;
            return (
              <Link key={item.href} href={item.href} aria-current={isActive ? "page" : undefined}>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="store-body">
        <header className="store-top">
          <p className="store-identity">
            <span>{displayName}</span>
            <span>Store Manager</span>
          </p>
          <DispatcherLogout apiOrigin={apiOrigin} />
        </header>
        <div className="store-heading">
          <p className="store-crumb">Store Manager{current && current.href !== "/store" ? ` > ${current.label}` : ""}</p>
          <h1>{current?.label ?? "Store Dashboard"}</h1>
        </div>
        <main className="store-main">{children}</main>
      </div>
      <nav className="store-nav" aria-label="Store Manager">
        {storeNavigation.map((item) => {
          const isActive = item.href === active;
          return (
            <Link key={item.href} href={item.href} aria-current={isActive ? "page" : undefined}>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
