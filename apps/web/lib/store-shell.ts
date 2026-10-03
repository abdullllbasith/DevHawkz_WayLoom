export const STORE_MANAGER_ROLE = "STORE_MANAGER";

export const storeNavigation = [
  { label: "Store Dashboard", href: "/store" },
  { label: "Create Order", href: "/store/orders/new" },
  { label: "Order Confirmation and Tracking", href: "/store/orders" },
  { label: "Confirm Receipt and Report Issues", href: "/store/receipts" },
] as const;

export type StoreAccess = "anonymous" | "forbidden" | "allowed";

export type StoreIdentity = {
  displayName: string;
  role: typeof STORE_MANAGER_ROLE;
};

export function storeAccess(role: string | null): StoreAccess {
  if (role === null) return "anonymous";
  if (role !== STORE_MANAGER_ROLE) return "forbidden";
  return "allowed";
}

export function parseStoreIdentity(value: unknown): StoreIdentity | null {
  if (typeof value !== "object" || value === null || !("user" in value)) return null;
  const user = value.user;
  if (typeof user !== "object" || user === null) return null;
  const record = user as Record<string, unknown>;
  if (record.role !== STORE_MANAGER_ROLE) return null;
  if (typeof record.displayName !== "string" || record.displayName.length === 0) return null;
  return { displayName: record.displayName, role: STORE_MANAGER_ROLE };
}

export function activeStoreHref(pathname: string): string | null {
  if (pathname === "/store") return "/store";
  const match = storeNavigation.find(
    (item) => item.href !== "/store" && (pathname === item.href || pathname.startsWith(`${item.href}/`)),
  );
  return match?.href ?? null;
}

export function storeShellMode(viewportWidth: number): "desktop" | "phone" {
  return viewportWidth >= 768 ? "desktop" : "phone";
}
