export const LOADER_ROLE = "LOADER";

export const loaderNavigation = [
  { label: "Dashboard", href: "/loader" },
  { label: "Loading", href: "/loader/loading" },
  { label: "Checklist", href: "/loader/checklist" },
  { label: "Loading Records", href: "/loader/records" },
] as const;

export type LoaderAccess = "anonymous" | "forbidden" | "allowed";

export type LoaderIdentity = {
  displayName: string;
  role: typeof LOADER_ROLE;
};

export function loaderAccess(role: string | null): LoaderAccess {
  if (role === null) return "anonymous";
  if (role !== LOADER_ROLE) return "forbidden";
  return "allowed";
}

export function parseLoaderIdentity(value: unknown): LoaderIdentity | null {
  if (typeof value !== "object" || value === null || !("user" in value)) return null;
  const user = value.user;
  if (typeof user !== "object" || user === null) return null;
  const record = user as Record<string, unknown>;
  if (record.role !== LOADER_ROLE) return null;
  if (typeof record.displayName !== "string" || record.displayName.length === 0) return null;
  return { displayName: record.displayName, role: LOADER_ROLE };
}

export function activeLoaderHref(pathname: string): string | null {
  if (pathname === "/loader") return "/loader";
  const match = loaderNavigation.find(
    (item) => item.href !== "/loader" && (pathname === item.href || pathname.startsWith(`${item.href}/`)),
  );
  return match?.href ?? null;
}

export function loaderShellMode(viewportWidth: number): "tablet" | "phone" {
  return viewportWidth >= 768 ? "tablet" : "phone";
}
