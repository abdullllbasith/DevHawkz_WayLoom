export const DRIVER_ROLE = "DRIVER";

export const driverNavigation = [
  { label: "My Routes", href: "/driver" },
  { label: "Delivery Stop Details", href: "/driver/stops" },
  { label: "Delivery Outcome", href: "/driver/outcome" },
  { label: "Proof of Delivery", href: "/driver/pod" },
] as const;

export type DriverAccess = "anonymous" | "forbidden" | "allowed";

export type DriverIdentity = {
  displayName: string;
  role: typeof DRIVER_ROLE;
};

export function driverAccess(role: string | null): DriverAccess {
  if (role === null) return "anonymous";
  if (role !== DRIVER_ROLE) return "forbidden";
  return "allowed";
}

export function parseDriverIdentity(value: unknown): DriverIdentity | null {
  if (typeof value !== "object" || value === null || !("user" in value)) return null;
  const user = value.user;
  if (typeof user !== "object" || user === null) return null;
  const record = user as Record<string, unknown>;
  if (record.role !== DRIVER_ROLE) return null;
  if (typeof record.displayName !== "string" || record.displayName.length === 0) return null;
  return { displayName: record.displayName, role: DRIVER_ROLE };
}

export function activeDriverHref(pathname: string): string | null {
  if (pathname === "/driver") return "/driver";
  const match = driverNavigation.find(
    (item) => item.href !== "/driver" && (pathname === item.href || pathname.startsWith(`${item.href}/`)),
  );
  return match?.href ?? null;
}

export function driverShellMode(viewportWidth: number): "tablet" | "phone" {
  return viewportWidth >= 768 ? "tablet" : "phone";
}
