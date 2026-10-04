"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { StatusBanner } from "../status-banner";
import { StoreDeliveryCard } from "./delivery-card";
import { awaitingReceiptOrders, pendingOrders, readStoreOrders, receivedOrders, type StoreOrder } from "../../lib/store-dashboard";

type LoadState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error" }
  | { kind: "unauthorized" }
  | { kind: "ready"; orders: StoreOrder[] };

export default function StoreDashboardPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/orders", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) {
          if (!cancelled) setState({ kind: "unauthorized" });
          return;
        }
        if (!response.ok) throw new Error("orders_unavailable");
        const orders = readStoreOrders(await response.json());
        if (orders === null) throw new Error("orders_invalid");
        if (!cancelled) setState(orders.length === 0 ? { kind: "empty" } : { kind: "ready", orders });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  if (state.kind === "loading") {
    return <StatusBanner tone="loading" title="Reading assigned orders" body="Orders stay hidden until the server responds." />;
  }
  if (state.kind === "unauthorized") {
    return <StatusBanner tone="denied" title="Orders are not available" body="This Store Manager cannot read these outlet orders." />;
  }
  if (state.kind === "error") {
    return (
      <StatusBanner
        tone="error"
        title="Orders are unavailable"
        body="The order list could not be read. This is not an empty outlet."
        action={<button type="button" className="store-action" onClick={() => setReloadKey((value) => value + 1)}>Retry</button>}
      />
    );
  }
  if (state.kind === "empty") {
    return (
      <StatusBanner
        tone="empty"
        title="No assigned orders"
        body="No order is recorded for the outlets assigned to this Store Manager."
        action={<Link className="store-action" href="/store/orders/new">Create Order</Link>}
      />
    );
  }

  const pending = pendingOrders(state.orders);
  const waiting = awaitingReceiptOrders(state.orders);
  const received = receivedOrders(state.orders);
  return (
    <div className="store-stack">
      <section className="store-kpis" aria-label="Order status counts">
        <article className="store-kpi">
          <span>Pending deliveries</span>
          <strong>{pending.length}</strong>
          <em>Not receipt confirmed</em>
        </article>
        <article className="store-kpi">
          <span>Awaiting confirmation</span>
          <strong>{waiting.length}</strong>
          <em>Status is Delivered</em>
        </article>
        <article className="store-kpi">
          <span>Received</span>
          <strong>{received.length}</strong>
          <em>Receipt confirmed</em>
        </article>
        <article className="store-kpi">
          <span>Assigned orders</span>
          <strong>{state.orders.length}</strong>
          <em>Driver, vehicle, and arrival are not on the order</em>
        </article>
      </section>
      <div className="store-section-head">
        <h2>Assigned deliveries ({state.orders.length})</h2>
        <Link className="store-link" href="/store/orders">View pending</Link>
      </div>
      {state.orders.map((order) => <StoreDeliveryCard key={order.id} order={order} />)}
    </div>
  );
}
