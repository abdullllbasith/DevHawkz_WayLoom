"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

import { WAYLOOM_CSRF_HEADER } from "../../../lib/api-client";
import { proofBody } from "../../../lib/driver-pod";

export default function DriverPodPage() {
  const stopId = useSearchParams().get("stop");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [message, setMessage] = useState<string | null>(null);
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
      setMessage("The server did not store the proof. Opening this screen is not delivery proof.");
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
