"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { activeDriverHref, driverNavigation } from "../../lib/driver-shell";
import { DispatcherLogout } from "../dispatcher/logout";

export function DriverFrame({
  apiOrigin,
  displayName,
  children,
}: {
  apiOrigin: string;
  displayName: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active = activeDriverHref(pathname);
  const current = driverNavigation.find((item) => item.href === active);

  return (
    <div className="driver-shell">
      <header className="driver-top">
        <div className="driver-brand">
          <span className="driver-mark" aria-hidden="true" />
          <span>WayLoom</span>
        </div>
        <p className="driver-identity">
          <span>{displayName}</span>
          <span>Driver</span>
        </p>
        <DispatcherLogout apiOrigin={apiOrigin} />
      </header>
      <div className="driver-heading">
        <p className="driver-crumb">Driver{current && current.href !== "/driver" ? ` > ${current.label}` : ""}</p>
        <h1>{current?.label ?? "Driver"}</h1>
        <p>Use this screen while stopped. Route changes are not available here.</p>
      </div>
      <main className="driver-main">{children}</main>
      <nav className="driver-nav" aria-label="Driver">
        {driverNavigation.map((item) => {
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
