"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

import { WAYLOOM_CSRF_HEADER } from "../../../lib/api-client";
import { deliveryOutcomeBody } from "../../../lib/driver-delivery";

export default function DriverOutcomePage() {
  const stopId = useSearchParams().get("stop");
  const [outcome, setOutcome] = useState("");
  const [deliveredUnits, setDeliveredUnits] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
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
      if (response.status === 409) {
        setMessage("This stop already has a delivery outcome.");
        return;
      }
      if (!response.ok) {
        setMessage("The server did not record the outcome. The stop is unchanged.");
        return;
      }
      setMessage("The delivery outcome was recorded.");
    } catch {
      setMessage("The server did not record the outcome. The stop is unchanged.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="driver-card">
      <h2>Record delivery result</h2>
      <p>Stop: {stopId ?? "—"}</p>
      <p>Outcome text is stored as entered. No outcome list is applied here.</p>
      <label>
        Outcome
        <input value={outcome} onChange={(event) => setOutcome(event.target.value)} />
      </label>
      <label>
        Delivered units
        <input value={deliveredUnits} onChange={(event) => setDeliveredUnits(event.target.value)} inputMode="numeric" />
      </label>
      <label>
        Notes
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      <button type="button" className="driver-action" onClick={() => void submit()} disabled={pending}>
        Save outcome
      </button>
      {message === null ? null : <p>{message}</p>}
    </section>
  );
}
