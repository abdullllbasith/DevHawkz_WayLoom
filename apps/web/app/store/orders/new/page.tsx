"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { StatusBanner } from "../../../status-banner";
import { WAYLOOM_CSRF_HEADER } from "../../../../lib/api-client";
import { readStoreOrders } from "../../../../lib/store-dashboard";
import { assignedOutlets, storeOrderBody } from "../../../../lib/store-order";
import { humanActionError } from "../../../../lib/status-copy";

export default function CreateOrderPage() {
  const [outlets, setOutlets] = useState<{ outletId: string; outletCode: string }[] | null>(null);
  const [outletId, setOutletId] = useState("");
  const [deliveryId, setDeliveryId] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [tempRequirement, setTempRequirement] = useState("chilled");
  const [orderUnits, setOrderUnits] = useState("");
  const [orderWeightKg, setOrderWeightKg] = useState("");
  const [orderVolumeM3, setOrderVolumeM3] = useState("");
  const [message, setMessage] = useState<{ tone: "error" | "success" | "info"; title: string; body: string } | null>(null);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/orders", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          if (!cancelled) setOutlets([]);
          return;
        }
        const orders = readStoreOrders(await response.json());
        if (orders === null || cancelled) return;
        const known = assignedOutlets(orders);
        setOutlets(known);
        setOutletId(known[0]?.outletId ?? "");
      })
      .catch(() => {
        if (!cancelled) setOutlets([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit() {
    const body = storeOrderBody({ deliveryId, orderDate, outletId, tempRequirement, orderUnits, orderWeightKg, orderVolumeM3 });
    if (body === null) {
      setMessage({
        tone: "error",
        title: "Order details are incomplete",
        body: "Enter a delivery id, date, outlet, temperature, whole-number units, and positive weight and volume.",
      });
      return;
    }
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setMessage(null);
    try {
      const token = await csrfToken();
      const created = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json", [WAYLOOM_CSRF_HEADER]: token },
        body: JSON.stringify(body),
      });
      const createdBody: unknown = await created.json().catch(() => null);
      if (!created.ok) {
        setMessage({ tone: "error", title: "The order was not created", body: humanActionError(created.status, createdBody, "create-order") });
        return;
      }
      const id = typeof createdBody === "object" && createdBody !== null && "id" in createdBody && typeof createdBody.id === "string" ? createdBody.id : null;
      if (id === null) {
        setMessage({ tone: "error", title: "The order response was incomplete", body: "The server response did not include an order id." });
        return;
      }
      const submitted = await fetch(`/api/orders/${encodeURIComponent(id)}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json", [WAYLOOM_CSRF_HEADER]: token },
        body: "{}",
      });
      const submittedBody: unknown = await submitted.json().catch(() => null);
      if (!submitted.ok) {
        setCreatedId(id);
        setMessage({
          tone: "info",
          title: "Draft saved",
          body: humanActionError(submitted.status, submittedBody, "submit-order") + " The order remains a draft.",
        });
        return;
      }
      setCreatedId(id);
      setMessage({
        tone: "success",
        title: "Order submitted",
        body: "Submitted. The Dispatcher confirms it before planning.",
      });
    } catch {
      setMessage({ tone: "error", title: "The order was not created", body: humanActionError(0, null, "create-order") });
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <div className="store-stack">
      {outlets === null ? <StatusBanner tone="loading" title="Reading assigned outlets" body="The outlet list stays hidden until the current orders are read." /> : null}
      {outlets !== null && outlets.length === 0 ? (
        <StatusBanner tone="empty" title="No outlet is assigned to this account" body="Create order stays closed until an assigned outlet is available from the current order list." />
      ) : null}
      <section className="store-card">
        <h2>Create and submit an order</h2>
        <p className="store-meta">Cutoff eligibility is decided by the server when the order is submitted.</p>
        <form className="store-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <label>
            Outlet
            <select value={outletId} onChange={(event) => setOutletId(event.target.value)} disabled={outlets === null || outlets.length === 0}>
              {(outlets ?? []).map((outlet) => (
                <option key={outlet.outletId} value={outlet.outletId}>{outlet.outletCode}</option>
              ))}
            </select>
          </label>
          <label>
            Delivery id
            <input value={deliveryId} onChange={(event) => setDeliveryId(event.target.value)} />
          </label>
          <label>
            Order date
            <input value={orderDate} onChange={(event) => setOrderDate(event.target.value)} placeholder="YYYY-MM-DD" />
          </label>
          <label>
            Temperature
            <select value={tempRequirement} onChange={(event) => setTempRequirement(event.target.value)}>
              <option value="chilled">Chilled</option>
              <option value="ambient">Ambient</option>
            </select>
          </label>
          <label>
            Units
            <input value={orderUnits} onChange={(event) => setOrderUnits(event.target.value)} inputMode="numeric" />
          </label>
          <label>
            Weight kg
            <input value={orderWeightKg} onChange={(event) => setOrderWeightKg(event.target.value)} />
          </label>
          <label>
            Volume m3
            <input value={orderVolumeM3} onChange={(event) => setOrderVolumeM3(event.target.value)} />
          </label>
          <button type="submit" className="store-action" disabled={pending || outlets === null || outlets.length === 0}>
            {pending ? "Saving..." : "Submit order"}
          </button>
        </form>
      </section>
      {message === null ? null : (
        <StatusBanner
          tone={message.tone}
          title={message.title}
          body={message.body}
          action={createdId === null ? undefined : <Link className="store-link" href={`/store/orders/${createdId}`}>Open this order</Link>}
        />
      )}
    </div>
  );
}

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/auth/csrf", { cache: "no-store" });
  const body: unknown = response.ok ? await response.json() : null;
  return typeof body === "object" && body !== null && "csrfToken" in body && typeof body.csrfToken === "string" ? body.csrfToken : "";
}
