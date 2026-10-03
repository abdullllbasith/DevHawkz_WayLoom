"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { readStoreOrders, storeStatusCounts, type StoreOrder } from "../../lib/store-dashboard";

type LoadState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "error" }
  | { kind: "unauthorized" }
  | { kind: "ready"; orders: StoreOrder[] };

export default function StoreDashboardPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

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
  }, []);

  return (
    <div className="store-list">
      <section className="store-card">
        <p>
          <Link href="/store/orders/new">Create Order</Link>
          {" · "}
          <Link href="/store/orders">Order Confirmation and Tracking</Link>
        </p>
      </section>
      {state.kind === "loading" ? (
        <section className="store-card">
          <h2>Loading assigned orders</h2>
          <p>Orders stay hidden until the server responds.</p>
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
          <p>No order is recorded for the outlets assigned to this Store Manager.</p>
        </section>
      ) : null}
      {state.kind === "ready" ? (
        <>
          <section className="store-card">
            <h2>Status</h2>
            {storeStatusCounts(state.orders).map((item) => (
              <p key={item.status}>
                {item.status}: {item.count}
              </p>
            ))}
            <p>Arrival time, vehicle, and driver: —</p>
          </section>
          {state.orders.map((order) => (
            <article key={order.id} className="store-card">
              <h2>{order.deliveryId}</h2>
              <p>Outlet: {order.outletCode}</p>
              <p>Date: {order.orderDate}</p>
              <p>Status: {order.status}</p>
              <p>Units: {order.orderUnits}</p>
              <p>Temperature: {order.tempRequirement}</p>
              <p>
                {order.brand} · {order.district} · {order.depot}
              </p>
            </article>
          ))}
        </>
      ) : null}
    </div>
  );
}
