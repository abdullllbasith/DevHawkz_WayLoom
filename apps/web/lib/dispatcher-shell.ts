export const DISPATCHER_ROLE = "DISPATCHER";

export const dispatcherNavigation = [
  { label: "Dashboard", href: "/dispatcher" },
  { label: "Orders", href: "/dispatcher/orders" },
  { label: "AI Planning", href: "/dispatcher/planning" },
  { label: "Vehicles", href: "/dispatcher/vehicles" },
  { label: "Routes", href: "/dispatcher/routes" },
  { label: "Workflow", href: "/dispatcher/workflow" },
  { label: "Analytics", href: "/dispatcher/analytics" },
  { label: "Reports", href: "/dispatcher/reports" },
  { label: "Settings", href: "/dispatcher/settings" },
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
    return null;
  }
  if (pathname === "/dispatcher/exceptions" || pathname.startsWith("/dispatcher/exceptions/")) {
    return null;
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
