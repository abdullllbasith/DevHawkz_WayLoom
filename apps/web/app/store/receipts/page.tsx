"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { WAYLOOM_CSRF_HEADER } from "../../../lib/api-client";
import { readStoreOrders, type StoreOrder } from "../../../lib/store-dashboard";
import { canConfirmReceipt, receiptBody } from "../../../lib/store-receipt";

type LoadState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error" }
  | { kind: "unauthorized" }
  | { kind: "ready"; orders: StoreOrder[] };

export default function ReceiptPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [result, setResult] = useState("accepted");
  const [issueDetails, setIssueDetails] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const submitting = useRef(false);

  const load = useCallback(() => {
    void fetch("/api/orders", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) {
          setState({ kind: "unauthorized" });
          return;
        }
        if (!response.ok) throw new Error("orders_unavailable");
        const orders = readStoreOrders(await response.json());
        if (orders === null) throw new Error("orders_invalid");
        setState(orders.length === 0 ? { kind: "empty" } : { kind: "ready", orders });
      })
      .catch(() => setState({ kind: "error" }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function confirm(orderId: string) {
    const body = receiptBody(result, issueDetails);
    if (body === null || submitting.current) return;
    submitting.current = true;
    setPendingId(orderId);
    setMessage(null);
    try {
      const token = await csrfToken();
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/receipt`, {
        method: "POST",
        headers: { "content-type": "application/json", [WAYLOOM_CSRF_HEADER]: token },
        body: JSON.stringify(body),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(`The server did not confirm the receipt. ${errorCode(payload)}`);
        return;
      }
      setMessage("The server recorded the receipt.");
      setIssueDetails("");
      load();
    } finally {
      submitting.current = false;
      setPendingId(null);
    }
  }

  return (
    <div className="store-list">
      <section className="store-card">
        <h2>Confirm Receipt and Report Issues</h2>
        <p>Receipt confirmation is available for a delivered order. The server records the actor and time.</p>
        <p>Exception reporting stays with the Dispatcher. This screen does not create an exception.</p>
      </section>
      {state.kind === "loading" ? (
        <section className="store-card">
          <h2>Loading orders</h2>
        </section>
      ) : null}
      {state.kind === "unauthorized" ? (
        <section className="store-card">
          <h2>Orders are not available</h2>
        </section>
      ) : null}
      {state.kind === "error" ? (
        <section className="store-card">
          <h2>Orders are unavailable</h2>
        </section>
      ) : null}
      {state.kind === "empty" ? (
        <section className="store-card">
          <h2>No assigned orders</h2>
        </section>
      ) : null}
      {state.kind === "ready"
        ? state.orders.map((order) => (
            <article key={order.id} className="store-card">
              <h2>{order.deliveryId}</h2>
              <p>Status: {order.status}</p>
              <p>Outlet: {order.outletCode}</p>
              {canConfirmReceipt(order.status) ? (
                <>
                  <label>
                    Result
                    <input value={result} onChange={(event) => setResult(event.target.value)} />
                  </label>
                  <label>
                    Issue details
                    <input value={issueDetails} onChange={(event) => setIssueDetails(event.target.value)} />
                  </label>
                  <button type="button" className="store-action" onClick={() => void confirm(order.id)} disabled={pendingId !== null}>
                    Confirm receipt
                  </button>
                </>
              ) : (
                <p>Receipt confirmation waits until this order is delivered.</p>
              )}
            </article>
          ))
        : null}
      {message === null ? null : (
        <section className="store-card">
          <p>{message}</p>
        </section>
      )}
    </div>
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
