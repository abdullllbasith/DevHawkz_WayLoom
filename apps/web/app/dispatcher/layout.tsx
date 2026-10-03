import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { resolveApiOrigin } from "../../lib/content-security-policy";
import { dispatcherAccess, parseDispatcherIdentity, sessionRole } from "../../lib/dispatcher-shell";
import { DispatcherFrame } from "./frame";
import "./dispatcher.css";

export default async function DispatcherLayout({ children }: { children: ReactNode }) {
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
  if (!response.ok) throw new Error("dispatcher_session_unavailable");
  const body: unknown = await response.json();
  const access = dispatcherAccess(sessionRole(body));
  if (access === "anonymous") redirect("/");
  const identity = parseDispatcherIdentity(body);
  if (access === "forbidden" || identity === null) {
    return (
      <main>
        <h1>Dispatcher access is not available</h1>
        <p>This workspace is limited to the Dispatcher role.</p>
      </main>
    );
  }
  return (
    <DispatcherFrame apiOrigin={origin} displayName={identity.displayName}>
      {children}
    </DispatcherFrame>
  );
}
