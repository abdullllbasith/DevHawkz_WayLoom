"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { readStoreOrders, type StoreOrder } from "../../../lib/store-dashboard";
import { orderProgressLabel, unavailableTracking } from "../../../lib/store-tracking";

type LoadState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error" }
  | { kind: "unauthorized" }
  | { kind: "ready"; orders: StoreOrder[]; stale: boolean };

export default function OrderTrackingPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

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
        setState(orders.length === 0 ? { kind: "empty" } : { kind: "ready", orders, stale: false });
      })
      .catch(() => {
        setState((current) => (keepPrevious && current.kind === "ready" ? { ...current, stale: true } : { kind: "error" }));
      });
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  return (
    <div className="store-list">
      <section className="store-card">
        <h2>Order Confirmation and Tracking</h2>
        <p>Status comes from the server. Refresh replaces this view with the latest read.</p>
        <button type="button" className="store-action" onClick={() => load(true)}>
          Refresh
        </button>
      </section>
      {state.kind === "loading" ? (
        <section className="store-card">
          <h2>Loading orders</h2>
        </section>
      ) : null}
      {state.kind === "unauthorized" ? (
        <section className="store-card">
          <h2>Orders are not available</h2>
          <p>This Store Manager cannot read these outlet orders.</p>
        </section>
      ) : null}
      {state.kind === "error" ? (
        <section className="store-card">
          <h2>Orders are unavailable</h2>
          <p>The order list could not be read. This is not an empty outlet.</p>
        </section>
      ) : null}
      {state.kind === "empty" ? (
        <section className="store-card">
          <h2>No assigned orders</h2>
        </section>
      ) : null}
      {state.kind === "ready" ? (
        <>
          {state.stale ? (
            <section className="store-card">
              <p>This list is from the last successful read. Refresh to replace it.</p>
            </section>
          ) : null}
          {state.orders.map((order) => (
            <article key={order.id} className="store-card">
              <h2>{order.deliveryId}</h2>
              <p>Status: {order.status}</p>
              <p>Progress: {orderProgressLabel(order.status)}</p>
              <p>Outlet: {order.outletCode}</p>
              <p>Vehicle: {unavailableTracking.vehicle}</p>
              <p>Route: {unavailableTracking.route}</p>
              <p>Arrival: {unavailableTracking.eta}</p>
              <p>
                <Link href={`/store/orders/${order.id}`}>Open order</Link>
              </p>
            </article>
          ))}
        </>
      ) : null}
    </div>
  );
}
