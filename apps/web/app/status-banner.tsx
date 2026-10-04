import type { ReactNode, SVGProps } from "react";

import { lifecycleBadgeClass, lifecycleLabel } from "../lib/status-copy";
import "./status-banner.css";

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={lifecycleBadgeClass(status)}>
      <StatusMark status={status} />
      {lifecycleLabel(status)}
    </span>
  );
}

function StatusMark({ status }: { status: string }) {
  if (status === "CONFIRMED" || status === "DELIVERED" || status === "RECEIPT_CONFIRMED" || status === "LOADED") {
    return (
      <Mark>
        <polyline points="20 6 9 17 4 12" />
      </Mark>
    );
  }
  if (status === "DEFERRED") {
    return (
      <Mark>
        <circle cx="12" cy="12" r="9" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </Mark>
    );
  }
  if (status === "DISPATCHED") {
    return (
      <Mark>
        <rect x="1" y="6" width="15" height="10" rx="1" />
        <polygon points="16 9 20 9 23 12 23 16 16 16 16 9" />
        <circle cx="6" cy="18" r="2" />
        <circle cx="18" cy="18" r="2" />
      </Mark>
    );
  }
  if (status === "PLANNED" || status === "PLANNED_ALLOCATED") {
    return (
      <Mark>
        <circle cx="12" cy="12" r="9" />
        <polyline points="12 7 12 12 15 14" />
      </Mark>
    );
  }
  return (
    <Mark>
      <circle cx="12" cy="12" r="9" />
    </Mark>
  );
}

function Mark({ children }: { children: ReactNode }) {
  const props: SVGProps<SVGSVGElement> = {
    width: 12,
    height: 12,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.4,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };
  return <svg {...props}>{children}</svg>;
}

export function StatusBanner({
  tone,
  title,
  body,
  action,
}: {
  tone: "loading" | "empty" | "error" | "denied" | "success" | "info" | "offline";
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  const role = tone === "error" || tone === "denied" ? "alert" : "status";
  if (tone === "loading") {
    return (
      <section className="wayloom-banner wayloom-banner-loading" role="status" aria-live="polite" aria-busy="true">
        <div className="wayloom-loading">
          <span className="wayloom-spinner" aria-hidden="true" />
          <div>
            <h2>{title}</h2>
            {body ? <p>{body}</p> : null}
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className={`wayloom-banner wayloom-banner-${tone}`} role={role}>
      <h2>{title}</h2>
      {body ? <p>{body}</p> : null}
      {action}
    </section>
  );
}
