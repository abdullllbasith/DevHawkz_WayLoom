export const DISPATCHER_ROLE = "DISPATCHER";

export const dispatcherNavigation = [
  { label: "Dashboard", href: "/dispatcher" },
  { label: "Orders", href: "/dispatcher/orders" },
  { label: "AI Planning", href: "/dispatcher/planning" },
  { label: "Routes", href: "/dispatcher/routes" },
  { label: "Deferrals", href: "/dispatcher/deferrals" },
  { label: "Exceptions", href: "/dispatcher/exceptions" },
  { label: "Vehicles", href: "/dispatcher/vehicles", quiet: true },
  { label: "Workflow", href: "/dispatcher/workflow", quiet: true },
  { label: "Analytics", href: "/dispatcher/analytics", quiet: true },
  { label: "Reports", href: "/dispatcher/reports", quiet: true },
  { label: "Settings", href: "/dispatcher/settings", quiet: true },
] as const;

export type DispatcherAccess = "anonymous" | "forbidden" | "allowed";

export type DispatcherIdentity = {
  displayName: string;
  role: typeof DISPATCHER_ROLE;
};

export function dispatcherAccess(role: string | null): DispatcherAccess {
  if (role === null) return "anonymous";
  if (role !== DISPATCHER_ROLE) return "forbidden";
  return "allowed";
}

export function sessionRole(value: unknown): string | null {
  const record = sessionRecord(value);
  return record !== null && typeof record.role === "string" ? record.role : null;
}

export function parseDispatcherIdentity(value: unknown): DispatcherIdentity | null {
  const record = sessionRecord(value);
  if (record === null || record.role !== DISPATCHER_ROLE) return null;
  if (typeof record.displayName !== "string" || record.displayName.length === 0) return null;
  return { displayName: record.displayName, role: DISPATCHER_ROLE };
}

function sessionRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || !("user" in value)) return null;
  const user = value.user;
  if (typeof user !== "object" || user === null) return null;
  return user as Record<string, unknown>;
}

export function activeDispatcherHref(pathname: string): string | null {
  if (pathname === "/dispatcher") return "/dispatcher";
  if (pathname === "/dispatcher/routes" || pathname.startsWith("/dispatcher/routes/")) return "/dispatcher/routes";
  if (
    pathname === "/dispatcher/planning" ||
    pathname.startsWith("/dispatcher/planning/") ||
    pathname.startsWith("/dispatcher/allocation-confirmation")
  ) {
    return "/dispatcher/planning";
  }
  if (pathname === "/dispatcher/deferrals" || pathname.startsWith("/dispatcher/deferrals/")) {
    return "/dispatcher/deferrals";
  }
  if (pathname === "/dispatcher/exceptions" || pathname.startsWith("/dispatcher/exceptions/")) {
    return "/dispatcher/exceptions";
  }
  const match = dispatcherNavigation.find((item) => item.href !== "/dispatcher" && (pathname === item.href || pathname.startsWith(`${item.href}/`)));
  return match?.href ?? null;
}

export function shellNavigationMode(viewportWidth: number): "desktop" | "narrow" {
  return viewportWidth >= 1024 ? "desktop" : "narrow";
}

export function logoutHeaders(csrfToken: string): Headers {
  const headers = new Headers();
  if (csrfToken.length > 0) headers.set("x-wayloom-csrf", csrfToken);
  return headers;
}
