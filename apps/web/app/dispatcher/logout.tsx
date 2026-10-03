"use client";

import { useState } from "react";

import { WAYLOOM_CSRF_HEADER } from "../../lib/api-client";
import { canRemoveLocalRecord } from "../../lib/offline-boundary";
import { openIndexedDbOfflineStore } from "../../lib/offline-store";

export function DispatcherLogout({ apiOrigin }: { apiOrigin: string }) {
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    const csrf = await fetch(`${apiOrigin}/api/auth/csrf`, { credentials: "include", cache: "no-store" });
    const body: unknown = csrf.ok ? await csrf.json() : null;
    const token = typeof body === "object" && body !== null && "csrfToken" in body && typeof body.csrfToken === "string" ? body.csrfToken : "";
    await fetch(`${apiOrigin}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: { [WAYLOOM_CSRF_HEADER]: token },
      cache: "no-store",
    });
    const store = await openIndexedDbOfflineStore().catch(() => null);
    if (store !== null) {
      const events = await store.listEvents();
      for (const event of events) {
        if (canRemoveLocalRecord({ state: event.state, reason: "logout" })) {
          await store.deleteEvent(event.clientEventId);
        }
      }
      await store.clearCompletedRoutes();
    }
    window.location.assign("/");
  }

  return (
    <button type="button" className="dispatcher-logout" onClick={() => void logout()} disabled={pending}>
      Log out
    </button>
  );
}
