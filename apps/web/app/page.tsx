import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveApiOrigin } from "../lib/content-security-policy";
import { LoginForm } from "./login-form";
import "./login.css";

export default async function HomePage() {
  const origin = resolveApiOrigin(process.env.API_ORIGIN, process.env.NODE_ENV);
  const cookie = (await headers()).get("cookie") ?? "";

  if (origin && cookie) {
    try {
      const response = await fetch(`${origin}/api/auth/me`, {
        headers: { cookie },
        cache: "no-store",
      });
      if (response.ok) {
        const data = await response.json();
        if (data?.user?.role === "DISPATCHER") {
          redirect("/dispatcher");
        }
      }
    } catch {
      // API unavailable or unauthenticated session; fall through to render login
    }
  }

  return <LoginForm />;
}
