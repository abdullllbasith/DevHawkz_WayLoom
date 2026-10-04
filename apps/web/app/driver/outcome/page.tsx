"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { StatusBanner } from "../../status-banner";
import { WAYLOOM_CSRF_HEADER } from "../../../lib/api-client";
import { deliveryOutcomeBody } from "../../../lib/driver-delivery";
import { humanActionError, offlineSavedMessage } from "../../../lib/status-copy";
import { recordOfflineAction } from "../../../lib/offline-recording";
import { openIndexedDbOfflineStore } from "../../../lib/offline-store";

export default function DriverOutcomePage() {
  const stopId = useSearchParams().get("stop");
  const [outcome, setOutcome] = useState("");
  const [deliveredUnits, setDeliveredUnits] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [eventId] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState(false);

  async function submit() {
    if (stopId === null || stopId.length === 0) {
      setMessage("Open a stop from an assigned route before recording an outcome.");
      return;
    }
    const body = deliveryOutcomeBody({ outcome, deliveredUnits, notes });
    if (body === null) {
      setMessage("Enter the delivery result. Units must be a whole number when provided.");
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
      const csrfBody: unknown = csrfResponse.ok ? await csrfResponse.json() : null;
      const token = typeof csrfBody === "object" && csrfBody !== null && "csrfToken" in csrfBody && typeof csrfBody.csrfToken === "string" ? csrfBody.csrfToken : "";
      const response = await fetch(`/api/deliveries/${encodeURIComponent(stopId)}/outcome`, {
        method: "POST",
        headers: { "content-type": "application/json", [WAYLOOM_CSRF_HEADER]: token },
        body: JSON.stringify(body),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(humanActionError(response.status, payload, "outcome"));
        return;
      }
      setMessage("The delivery outcome was recorded.");
    } catch {
      const store = await openIndexedDbOfflineStore();
      await recordOfflineAction({
        store,
        clientEventId: eventId,
        eventType: "delivery outcome",
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
        <h2 className="selected-orders-title">Record delivery result</h2>
        <p className="kpi-subtitle">Stop {stopId ?? "—"}</p>
        <p className="insight-text">Outcome text is stored as entered. No outcome list is applied here.</p>
        <label className="driver-field">
          Outcome
          <input value={outcome} onChange={(event) => setOutcome(event.target.value)} />
        </label>
        <label className="driver-field">
          Delivered units
          <input value={deliveredUnits} onChange={(event) => setDeliveredUnits(event.target.value)} inputMode="numeric" />
        </label>
        <label className="driver-field">
          Notes
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} />
        </label>
        <button type="button" className="btn-primary driver-touch" onClick={() => void submit()} disabled={pending}>
          {pending ? "Saving..." : "Save outcome"}
        </button>
        {message === null ? null : <p className="dashboard-feedback" role="status">{message}</p>}
        {message === "The delivery outcome was recorded." ? (
          <Link className="btn-primary driver-touch" href={`/driver/pod?stop=${encodeURIComponent(stopId)}`}>Add proof for this stop</Link>
        ) : null}
      </section>
      <aside className="dashboard-card order-insights-card">
        <h2 className="insights-card-title">What is stored</h2>
        <p className="insight-text">The result, an optional unit count, and optional notes.</p>
        <p className="insight-text">A failed connection keeps the result on this device until the next sync.</p>
      </aside>
    </div>
  );
}
