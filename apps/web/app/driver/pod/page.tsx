"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { StatusBanner } from "../../status-banner";
import { WAYLOOM_CSRF_HEADER } from "../../../lib/api-client";
import { proofBody } from "../../../lib/driver-pod";
import { humanActionError, offlineSavedMessage } from "../../../lib/status-copy";
import { recordOfflineAction } from "../../../lib/offline-recording";
import { openIndexedDbOfflineStore } from "../../../lib/offline-store";

export default function DriverPodPage() {
  const stopId = useSearchParams().get("stop");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [eventId] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState(false);

  async function submit() {
    if (stopId === null || stopId.length === 0) {
      setMessage("Open a stop that already has a delivery outcome.");
      return;
    }
    const body = proofBody(evidenceReference);
    if (body === null) {
      setMessage("Enter the evidence reference. Photos and signatures are not captured here.");
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
      const csrfBody: unknown = csrfResponse.ok ? await csrfResponse.json() : null;
      const token = typeof csrfBody === "object" && csrfBody !== null && "csrfToken" in csrfBody && typeof csrfBody.csrfToken === "string" ? csrfBody.csrfToken : "";
      const response = await fetch(`/api/deliveries/${encodeURIComponent(stopId)}/pod`, {
        method: "POST",
        headers: { "content-type": "application/json", [WAYLOOM_CSRF_HEADER]: token },
        body: JSON.stringify(body),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(humanActionError(response.status, payload, "proof"));
        return;
      }
      setMessage("The proof reference was stored.");
    } catch {
      const store = await openIndexedDbOfflineStore();
      await recordOfflineAction({
        store,
        clientEventId: eventId,
        eventType: "proof of delivery",
        targetId: stopId,
        clientCreatedAt: new Date().toISOString(),
        payload: body,
      });
      setMessage(offlineSavedMessage);
    } finally {
      setPending(false);
    }
  }

  if (stopId === null || stopId.length === 0) {
    return (
      <StatusBanner
        tone="empty"
        title="No stop selected"
        body="Open a stop from My Routes to continue."
        action={<Link className="btn-primary driver-touch" href="/driver">Back to My Routes</Link>}
      />
    );
  }

  return (
    <div className="orders-middle-grid">
      <section className="dashboard-card driver-form">
        <h2 className="selected-orders-title">Proof of delivery</h2>
        <p className="kpi-subtitle">Stop {stopId ?? "—"}</p>
        <p className="insight-text">The approved proof is an evidence reference. Map position, photos, and signatures are unavailable.</p>
        <label className="driver-field">
          Evidence reference
          <input value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} />
        </label>
        <button type="button" className="btn-primary driver-touch" onClick={() => void submit()} disabled={pending}>
          {pending ? "Saving..." : "Save proof"}
        </button>
        {message === null ? null : <p className="dashboard-feedback" role="status">{message}</p>}
        {message === "The proof reference was stored." ? (
          <Link className="btn-primary driver-touch" href="/driver">Back to My Routes</Link>
        ) : null}
      </section>
      <aside className="dashboard-card order-insights-card">
        <h2 className="insights-card-title">What is stored</h2>
        <p className="insight-text">One evidence reference for a stop that already has a delivery outcome.</p>
        <p className="insight-text">Opening this screen is not delivery proof.</p>
      </aside>
    </div>
  );
}
