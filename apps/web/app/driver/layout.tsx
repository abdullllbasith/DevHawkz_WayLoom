import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { resolveApiOrigin } from "../../lib/content-security-policy";
import { driverAccess, parseDriverIdentity } from "../../lib/driver-shell";
import { sessionRole } from "../../lib/dispatcher-shell";
import { DriverFrame } from "./frame";
import "../dispatcher/dispatcher.css";
import "./driver.css";

export default async function DriverLayout({ children }: { children: ReactNode }) {
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
  if (!response.ok) throw new Error("driver_session_unavailable");
  const body: unknown = await response.json();
  const access = driverAccess(sessionRole(body));
  if (access === "anonymous") redirect("/");
  const identity = parseDriverIdentity(body);
  if (access === "forbidden" || identity === null) {
    return (
      <main className="driver-denied">
        <h1>Driver access is not available</h1>
        <p>This workspace is limited to the Driver role.</p>
      </main>
    );
  }
  return (
    <DriverFrame displayName={identity.displayName}>
      {children}
    </DriverFrame>
  );
}
