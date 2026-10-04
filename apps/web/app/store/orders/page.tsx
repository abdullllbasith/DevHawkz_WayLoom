"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { StatusBanner } from "../../status-banner";
import { StoreDeliveryCard } from "../delivery-card";
import { pendingOrders, readStoreOrders, type StoreOrder } from "../../../lib/store-dashboard";

type LoadState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error" }
  | { kind: "unauthorized" }
  | { kind: "ready"; orders: StoreOrder[]; stale: boolean };

export default function OrderTrackingPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [query, setQuery] = useState("");

  const load = useCallback((keepPrevious: boolean) => {
    void fetch("/api/orders", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) {
          setState({ kind: "unauthorized" });
          return;
        }
        if (!response.ok) throw new Error("orders_unavailable");
        const orders = readStoreOrders(await response.json());
        if (orders === null) throw new Error("orders_invalid");
        const pending = pendingOrders(orders);
        setState(pending.length === 0 ? { kind: "empty" } : { kind: "ready", orders: pending, stale: false });
      })
      .catch(() => {
        setState((current) => (keepPrevious && current.kind === "ready" ? { ...current, stale: true } : { kind: "error" }));
      });
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  const visible = useMemo(() => {
    if (state.kind !== "ready") return [];
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return state.orders;
    return state.orders.filter((order) => `${order.deliveryId} ${order.outletCode} ${order.brand}`.toLowerCase().includes(needle));
  }, [query, state]);

  return (
    <div className="store-stack">
      <div className="store-section-head">
        <p className="store-meta">These orders are still moving. Receipt confirmed orders are on Received Deliveries.</p>
        <input className="store-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search delivery or outlet" aria-label="Search pending deliveries" />
      </div>
      {state.kind === "loading" ? <StatusBanner tone="loading" title="Reading orders" body="Pending deliveries stay hidden until the server responds." /> : null}
      {state.kind === "unauthorized" ? <StatusBanner tone="denied" title="Orders are not available" body="This Store Manager cannot read these outlet orders." /> : null}
      {state.kind === "error" ? (
        <StatusBanner tone="error" title="Orders are unavailable" body="The order list could not be read. This is not an empty outlet." action={<button type="button" className="store-action" onClick={() => load(false)}>Retry</button>} />
      ) : null}
      {state.kind === "empty" ? (
        <StatusBanner tone="empty" title="No pending deliveries" body="Every assigned order is receipt confirmed, or none has been created." action={<Link className="store-action" href="/store/orders/new">Create Order</Link>} />
      ) : null}
      {state.kind === "ready" ? (
        <>
          {state.stale ? <StatusBanner tone="offline" title="Showing the last successful read" body="Refresh to replace this list." /> : null}
          <div className="store-actions">
            <button type="button" className="store-action" onClick={() => load(true)}>Refresh</button>
          </div>
          {visible.length === 0 ? <StatusBanner tone="empty" title="No deliveries match this search" body="The pending list itself is not empty." /> : null}
          {visible.map((order) => <StoreDeliveryCard key={order.id} order={order} />)}
        </>
      ) : null}
    </div>
  );
}
