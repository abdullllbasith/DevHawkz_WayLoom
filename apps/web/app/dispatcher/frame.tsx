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
  return (
    <div className="dispatcher-shell">
      <aside className="dispatcher-sidebar">
        <p className="dispatcher-identity">WayLoom</p>
        <p className="dispatcher-role">Dispatcher</p>
        <p className="dispatcher-user">{displayName}</p>
        <nav className="dispatcher-nav" aria-label="Dispatcher">
          {dispatcherNavigation.map((item) => (
            <Link key={item.href} href={item.href} aria-current={item.href === active ? "page" : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
        <DispatcherLogout apiOrigin={apiOrigin} />
      </aside>
      <div className="dispatcher-main">
        <header className="dispatcher-header">
          <input id="dispatcher-menu" className="dispatcher-menu" type="checkbox" aria-label="Show Dispatcher navigation" />
          <p className="dispatcher-status">Planning stays a recommendation until the Dispatcher confirms it.</p>
        </header>
        <main className="dispatcher-content">{children}</main>
      </div>
    </div>
  );
}
