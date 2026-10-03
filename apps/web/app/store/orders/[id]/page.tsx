"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { readStoreOrder, type StoreOrder } from "../../../../lib/store-dashboard";
import { orderProgressLabel, unavailableTracking } from "../../../../lib/store-tracking";

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "unauthorized" }
  | { kind: "missing" }
  | { kind: "ready"; order: StoreOrder; stale: boolean };

export default function OrderTrackingDetailPage() {
  const params = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const load = useCallback(
    (keepPrevious: boolean) => {
      void fetch(`/api/orders/${encodeURIComponent(params.id)}`, { cache: "no-store" })
        .then(async (response) => {
          if (response.status === 401 || response.status === 403) {
            setState({ kind: "unauthorized" });
            return;
          }
          if (response.status === 404) {
            setState({ kind: "missing" });
            return;
          }
          if (!response.ok) throw new Error("order_unavailable");
          const order = readStoreOrder(await response.json());
          if (order === null) throw new Error("order_invalid");
          setState({ kind: "ready", order, stale: false });
        })
        .catch(() => {
          setState((current) => (keepPrevious && current.kind === "ready" ? { ...current, stale: true } : { kind: "error" }));
        });
    },
    [params.id],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  return (
    <div className="store-list">
      <section className="store-card">
        <p>
          <Link href="/store/orders">Back to tracking</Link>
        </p>
        <button type="button" className="store-action" onClick={() => load(true)}>
          Refresh
        </button>
      </section>
      {state.kind === "loading" ? (
        <section className="store-card">
          <h2>Loading order</h2>
        </section>
      ) : null}
      {state.kind === "unauthorized" ? (
        <section className="store-card">
          <h2>This order is not available</h2>
          <p>This Store Manager cannot read this outlet order.</p>
        </section>
      ) : null}
      {state.kind === "missing" ? (
        <section className="store-card">
          <h2>Order was not found</h2>
        </section>
      ) : null}
      {state.kind === "error" ? (
        <section className="store-card">
          <h2>Order is unavailable</h2>
        </section>
      ) : null}
      {state.kind === "ready" ? (
        <section className="store-card">
          {state.stale ? <p>This order is from the last successful read. Refresh to replace it.</p> : null}
          <h2>{state.order.deliveryId}</h2>
          <p>Status: {state.order.status}</p>
          <p>Progress: {orderProgressLabel(state.order.status)}</p>
          <p>Outlet: {state.order.outletCode}</p>
          <p>Date: {state.order.orderDate}</p>
          <p>Units: {state.order.orderUnits}</p>
          <p>Temperature: {state.order.tempRequirement}</p>
          <p>Vehicle: {unavailableTracking.vehicle}</p>
          <p>Route: {unavailableTracking.route}</p>
          <p>Arrival: {unavailableTracking.eta}</p>
        </section>
      ) : null}
    </div>
  );
}
