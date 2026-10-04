import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { resolveApiOrigin } from "../../lib/content-security-policy";
import { dispatcherAccess, parseDispatcherIdentity, sessionRole } from "../../lib/dispatcher-shell";
import { WorkspaceNotice } from "./unavailable";
import { DispatcherFrame } from "./frame";
import { OperationalDateProvider } from "./operational-date";
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
      <main className="workspace-notice-page">
        <WorkspaceNotice
          title="Dispatcher access is not available"
          body="This workspace is limited to the Dispatcher role."
        />
      </main>
    );
  }
  return (
    <OperationalDateProvider>
      <DispatcherFrame displayName={identity.displayName}>
        {children}
      </DispatcherFrame>
    </OperationalDateProvider>
  );
}
