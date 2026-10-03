import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { resolveApiOrigin } from "../../lib/content-security-policy";
import { sessionRole } from "../../lib/dispatcher-shell";
import { parseStoreIdentity, storeAccess } from "../../lib/store-shell";
import { StoreFrame } from "./frame";
import "./store.css";

export default async function StoreLayout({ children }: { children: ReactNode }) {
  const origin = resolveApiOrigin(process.env.API_ORIGIN, process.env.NODE_ENV);
  if (origin === null) redirect("/");
  const session = await cookies();
  let response: Response;
  try {
    response = await fetch(`${origin}/api/auth/me`, {
      headers: { cookie: session.toString() },
      cache: "no-store",
    });
  } catch {
    redirect("/");
  }
  if (response.status === 401) redirect("/");
  if (!response.ok) throw new Error("store_session_unavailable");
  const body: unknown = await response.json();
  const access = storeAccess(sessionRole(body));
  if (access === "anonymous") redirect("/");
  const identity = parseStoreIdentity(body);
  if (access === "forbidden" || identity === null) {
    return (
      <main className="store-denied">
        <h1>Store Manager access is not available</h1>
        <p>This workspace is limited to the Store Manager role.</p>
      </main>
    );
  }
  return (
    <StoreFrame apiOrigin={origin} displayName={identity.displayName}>
      {children}
    </StoreFrame>
  );
}
