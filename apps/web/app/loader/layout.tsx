import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { resolveApiOrigin } from "../../lib/content-security-policy";
import { loaderAccess, parseLoaderIdentity } from "../../lib/loader-shell";
import { sessionRole } from "../../lib/dispatcher-shell";
import { LoaderFrame } from "./frame";
import "../dispatcher/dispatcher.css";
import "./loader.css";

export default async function LoaderLayout({ children }: { children: ReactNode }) {
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
  if (!response.ok) throw new Error("loader_session_unavailable");
  const body: unknown = await response.json();
  const access = loaderAccess(sessionRole(body));
  if (access === "anonymous") redirect("/");
  const identity = parseLoaderIdentity(body);
  if (access === "forbidden" || identity === null) {
    return (
      <main className="loader-denied">
        <h1>Loader access is not available</h1>
        <p>This workspace is limited to the Loader role.</p>
      </main>
    );
  }
  return (
    <LoaderFrame displayName={identity.displayName}>
      {children}
    </LoaderFrame>
  );
}
