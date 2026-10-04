"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { StatusBadge, StatusBanner } from "../../status-banner";
import { WAYLOOM_CSRF_HEADER } from "../../../lib/api-client";
import { awaitingReceiptOrders, readStoreOrders, receivedOrders, type StoreOrder } from "../../../lib/store-dashboard";
import { receiptBody } from "../../../lib/store-receipt";
import { humanActionError } from "../../../lib/status-copy";
import { shortId } from "../../../lib/short-id";

type LoadState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error" }
  | { kind: "unauthorized" }
  | { kind: "ready"; orders: StoreOrder[] };

export default function ReceiptPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [result, setResult] = useState("Received");
  const [issueDetails, setIssueDetails] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; title: string; body: string } | null>(null);
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
        setMessage({ tone: "error", title: "Receipt was not recorded", body: humanActionError(response.status, payload, "receipt") });
        return;
      }
      setMessage({ tone: "success", title: "Receipt recorded", body: "The server recorded the receipt. This order is complete for the store." });
      setIssueDetails("");
      load();
    } catch {
      setMessage({ tone: "error", title: "Receipt was not recorded", body: humanActionError(0, null, "receipt") });
    } finally {
      submitting.current = false;
      setPendingId(null);
    }
  }

  const waiting = state.kind === "ready" ? awaitingReceiptOrders(state.orders) : [];
  const received = state.kind === "ready" ? receivedOrders(state.orders) : [];

  return (
    <div className="store-stack">
      <p className="store-meta">Receipt confirmation is available for a delivered order. Issue details stay on this receipt. They do not create a Dispatcher exception. Driver, vehicle, and received time are not on the order.</p>
      {state.kind === "loading" ? <StatusBanner tone="loading" title="Reading orders" body="Received deliveries stay hidden until the server responds." /> : null}
      {state.kind === "unauthorized" ? <StatusBanner tone="denied" title="Orders are not available" body="This Store Manager cannot read these outlet orders." /> : null}
      {state.kind === "error" ? (
        <StatusBanner tone="error" title="Orders are unavailable" body="The order list could not be read. This is not an empty outlet." action={<button type="button" className="store-action" onClick={() => load()}>Retry</button>} />
      ) : null}
      {state.kind === "empty" ? <StatusBanner tone="empty" title="No assigned orders" body="A receipt can be confirmed only after an assigned order is delivered." /> : null}
      {waiting.map((order) => (
        <article key={order.id} className="store-card">
          <div className="store-section-head">
            <h2 title={order.deliveryId}>{shortId(order.deliveryId)}</h2>
            <StatusBadge status={order.status} />
          </div>
          <p className="store-meta">Outlet {order.outletCode} · {order.orderUnits} units · {order.tempRequirement}</p>
          <form className="store-form" onSubmit={(event) => { event.preventDefault(); void confirm(order.id); }}>
            <label>
              Result
              <input value={result} onChange={(event) => setResult(event.target.value)} />
            </label>
            <label>
              Issue details
              <input value={issueDetails} onChange={(event) => setIssueDetails(event.target.value)} placeholder="Optional. This does not open a Dispatcher exception." />
            </label>
            <button type="submit" className="store-action" disabled={pendingId !== null}>
              {pendingId === order.id ? "Saving..." : "Confirm receipt"}
            </button>
          </form>
        </article>
      ))}
      {state.kind === "ready" && received.length === 0 ? <StatusBanner tone="empty" title="No received deliveries" body="An order appears here after the receipt is confirmed." /> : null}
      {received.length > 0 ? (
        <div className="store-table-wrap">
          <table className="store-table">
            <thead>
              <tr>
                <th>Delivery</th>
                <th>Outlet</th>
                <th>Date</th>
                <th>Units</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {received.map((order) => (
                <tr key={order.id}>
                  <td title={order.deliveryId}>{shortId(order.deliveryId)}</td>
                  <td>{order.outletCode}</td>
                  <td>{order.orderDate}</td>
                  <td>{order.orderUnits}</td>
                  <td><StatusBadge status={order.status} /></td>
                  <td><Link className="store-link" href={`/store/orders/${order.id}`}>Open order</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {message === null ? null : <StatusBanner tone={message.tone} title={message.title} body={message.body} />}
    </div>
  );
}

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/auth/csrf", { cache: "no-store" });
  const body: unknown = response.ok ? await response.json() : null;
  return typeof body === "object" && body !== null && "csrfToken" in body && typeof body.csrfToken === "string" ? body.csrfToken : "";
}
