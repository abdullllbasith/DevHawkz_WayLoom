"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { WAYLOOM_CSRF_HEADER } from "../../../../lib/api-client";
import { readStoreOrders } from "../../../../lib/store-dashboard";
import { assignedOutlets, storeOrderBody } from "../../../../lib/store-order";

export default function CreateOrderPage() {
  const [outlets, setOutlets] = useState<{ outletId: string; outletCode: string }[]>([]);
  const [outletId, setOutletId] = useState("");
  const [deliveryId, setDeliveryId] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [tempRequirement, setTempRequirement] = useState("chilled");
  const [orderUnits, setOrderUnits] = useState("");
  const [orderWeightKg, setOrderWeightKg] = useState("");
  const [orderVolumeM3, setOrderVolumeM3] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/orders", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const orders = readStoreOrders(await response.json());
        if (orders === null || cancelled) return;
        const known = assignedOutlets(orders);
        setOutlets(known);
        setOutletId(known[0]?.outletId ?? "");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit() {
    const body = storeOrderBody({ deliveryId, orderDate, outletId, tempRequirement, orderUnits, orderWeightKg, orderVolumeM3 });
    if (body === null) {
      setMessage("Enter a delivery id, date, outlet, temperature, whole-number units, and positive weight and volume.");
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
        setMessage(`The server did not create the order. ${errorCode(createdBody)}`);
        return;
      }
      const id = typeof createdBody === "object" && createdBody !== null && "id" in createdBody && typeof createdBody.id === "string" ? createdBody.id : null;
      if (id === null) {
        setMessage("The server response did not include an order id.");
        return;
      }
      const submitted = await fetch(`/api/orders/${encodeURIComponent(id)}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json", [WAYLOOM_CSRF_HEADER]: token },
        body: "{}",
      });
      if (!submitted.ok) {
        setCreatedId(id);
        setMessage("The order was created and was not submitted. It remains a draft.");
        return;
      }
      setCreatedId(id);
      setMessage("The order was submitted. Planning eligibility stays on the server.");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <section className="store-card">
      <h2>Create and submit an order</h2>
      <p>Cutoff eligibility is decided by the server when the order is submitted.</p>
      {outlets.length === 0 ? <p>No assigned outlet is available from the current order list.</p> : null}
      <label>
        Outlet
        <select value={outletId} onChange={(event) => setOutletId(event.target.value)}>
          {outlets.map((outlet) => (
            <option key={outlet.outletId} value={outlet.outletId}>
              {outlet.outletCode}
            </option>
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
          <option value="chilled">chilled</option>
          <option value="ambient">ambient</option>
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
      <button type="button" className="store-action" onClick={() => void submit()} disabled={pending || outlets.length === 0}>
        Submit order
      </button>
      {message === null ? null : <p>{message}</p>}
      {createdId === null ? null : <p><Link href={`/store/orders/${createdId}`}>Open this order</Link></p>}
    </section>
  );
}

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/auth/csrf", { cache: "no-store" });
  const body: unknown = response.ok ? await response.json() : null;
  return typeof body === "object" && body !== null && "csrfToken" in body && typeof body.csrfToken === "string" ? body.csrfToken : "";
}

function errorCode(value: unknown): string {
  if (typeof value !== "object" || value === null || !("error" in value)) return "";
  const error = value.error;
  if (typeof error !== "object" || error === null || !("code" in error) || typeof error.code !== "string") return "";
  return error.code;
}
