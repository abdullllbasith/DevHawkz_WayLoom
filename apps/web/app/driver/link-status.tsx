"use client";

import { useEffect, useState } from "react";

import { driverLinkPhase, type DriverLinkPhase } from "../../lib/driver-link";
import { pendingSyncEvents, reconcileOfflineEvents } from "../../lib/offline-policy";
import { cacheDriverRoutes, readAssignedRoutes, submitSyncBatch } from "../../lib/offline-reconciliation";
import { openIndexedDbOfflineStore, type PendingSyncEvent } from "../../lib/offline-store";

export function DriverLinkStatus() {
  const [phase, setPhase] = useState<DriverLinkPhase | null>(null);

  useEffect(() => {
    let cancelled = false;
    let active = false;

    async function refresh(reason: "mount" | "online" | "offline") {
      if (cancelled) return;
      if (reason === "offline" || !navigator.onLine) {
        setPhase("offline");
        return;
      }
      if (active) return;
      active = true;
      try {
        const store = await openIndexedDbOfflineStore().catch(() => null);
        const pending = store === null ? [] : pendingSyncEvents(await store.listEvents());
        const syncInFlight = reason === "online" || pending.length > 0;
        if (syncInFlight && !cancelled) setPhase("syncing");
        if (store !== null && syncInFlight) {
          await reconcileOfflineEvents({
            store,
            submit: submitPending,
            refresh: (trips) => cacheDriverRoutes(store, trips, new Date().toISOString()),
            readRoutes: () => readAssignedRoutes(),
          }).catch(() => undefined);
        }
        const routes = await readAssignedRoutes();
        if (cancelled) return;
        setPhase(driverLinkPhase({ browserOnline: navigator.onLine, serverReachable: routes.ok, syncInFlight: false }));
      } finally {
        active = false;
      }
    }

    const onOffline = () => {
      void refresh("offline");
    };
    const onOnline = () => {
      void refresh("online");
    };
    void refresh(navigator.onLine ? "mount" : "offline");
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  if (phase === null) return null;

  return (
    <p className={`driver-link is-${phase}`} aria-live="polite">
      {phase === "online" ? <WifiIcon /> : null}
      <span>{phase === "online" ? "Online" : phase === "offline" ? "Offline" : "Syncing"}</span>
    </p>
  );
}

function WifiIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  );
}

async function submitPending(events: readonly PendingSyncEvent[]) {
  const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
  const csrfBody: unknown = csrfResponse.ok ? await csrfResponse.json() : null;
  const token = typeof csrfBody === "object" && csrfBody !== null && "csrfToken" in csrfBody && typeof csrfBody.csrfToken === "string" ? csrfBody.csrfToken : "";
  return submitSyncBatch({ events, csrfToken: token });
}
