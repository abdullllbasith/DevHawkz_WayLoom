"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

import { WAYLOOM_CSRF_HEADER } from "../../../lib/api-client";
import { proofBody } from "../../../lib/driver-pod";
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
      if (!response.ok) {
        setMessage("The server did not store the proof. Opening this screen is not delivery proof.");
        return;
      }
      setMessage("The proof reference was stored.");
    } catch {
      const store = await openIndexedDbOfflineStore();
      const saved = await recordOfflineAction({
        store,
        clientEventId: eventId,
        eventType: "proof of delivery",
        targetId: stopId,
        clientCreatedAt: new Date().toISOString(),
        payload: body,
      });
      setMessage(`${saved.state}. The server has not confirmed this proof.`);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="driver-card">
      <h2>Proof of delivery</h2>
      <p>Stop: {stopId ?? "—"}</p>
      <p>The approved proof is an evidence reference. Map position, photos, and signatures are unavailable.</p>
      <label>
        Evidence reference
        <input value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} />
      </label>
      <button type="button" className="driver-action" onClick={() => void submit()} disabled={pending}>
        Save proof
      </button>
      {message === null ? null : <p>{message}</p>}
    </section>
  );
}
