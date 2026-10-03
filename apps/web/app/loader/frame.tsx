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

  return (
    <div className="loader-shell">
      <header className="loader-top">
        <div className="loader-brand">
          <span className="loader-mark" aria-hidden="true" />
          <span>WayLoom</span>
        </div>
        <p className="loader-identity">
          <span>{displayName}</span>
          <span>Loader</span>
        </p>
        <DispatcherLogout apiOrigin={apiOrigin} />
      </header>
      <div className="loader-heading">
        <p className="loader-crumb">Loader{current && current.href !== "/loader" ? ` > ${current.label}` : ""}</p>
        <h1>{current?.label ?? "Loader"}</h1>
      </div>
      <main className="loader-main">{children}</main>
      <nav className="loader-nav" aria-label="Loader">
        {loaderNavigation.map((item) => {
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
