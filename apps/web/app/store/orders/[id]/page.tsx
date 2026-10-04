"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { StatusBadge, StatusBanner } from "../../../status-banner";
import { lifecycleLabel } from "../../../../lib/status-copy";
import { readStoreOrder, type StoreOrder } from "../../../../lib/store-dashboard";
import { unavailableTracking } from "../../../../lib/store-tracking";
import { shortId } from "../../../../lib/short-id";

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "unauthorized" }
  | { kind: "missing" }
  | { kind: "ready"; order: StoreOrder; stale: boolean };

const steps = ["SUBMITTED", "CONFIRMED", "PLANNED_ALLOCATED", "LOADED", "DISPATCHED", "DELIVERED", "RECEIPT_CONFIRMED"] as const;

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
    <div className="store-stack">
      <div className="store-actions">
        <Link className="store-link" href="/store/orders">Back to tracking</Link>
        <button type="button" className="store-action" onClick={() => load(true)}>Refresh</button>
      </div>
      {state.kind === "loading" ? <StatusBanner tone="loading" title="Reading this order" body="Details stay hidden until the server responds." /> : null}
      {state.kind === "unauthorized" ? <StatusBanner tone="denied" title="This order is not available" body="This Store Manager cannot read this outlet order." /> : null}
      {state.kind === "missing" ? (
        <StatusBanner tone="empty" title="Order was not found" body="It is not on the outlets assigned to this account." action={<Link className="store-link" href="/store/orders">Back to tracking</Link>} />
      ) : null}
      {state.kind === "error" ? (
        <StatusBanner tone="error" title="Order is unavailable" body="The order could not be read. This is not an empty record." action={<button type="button" className="store-action" onClick={() => load(false)}>Retry</button>} />
      ) : null}
      {state.kind === "ready" ? (
        <section className="store-card store-order">
          {state.stale ? <StatusBanner tone="offline" title="Showing the last successful read" body="Refresh to replace it." /> : null}
          <div className="store-order-head">
            <h2 title={state.order.deliveryId}>{shortId(state.order.deliveryId)}</h2>
            <StatusBadge status={state.order.status} />
          </div>
          <p className="store-meta">{state.order.outletCode} · {state.order.orderDate} · {state.order.orderUnits} units · {state.order.tempRequirement}</p>
          <p className="store-meta">Vehicle {unavailableTracking.vehicle} · Route {unavailableTracking.route} · Arrival {unavailableTracking.eta}</p>
          <ol className="store-steps">
            {steps.map((step) => (
              <li key={step} data-current={step === state.order.status ? "true" : undefined}>{lifecycleLabel(step)}</li>
            ))}
          </ol>
          {state.order.status === "DELIVERED" ? <Link className="store-action" href="/store/receipts">Confirm receipt</Link> : null}
          {state.order.status === "RECEIPT_CONFIRMED" ? <p className="store-meta">Receipt already recorded.</p> : null}
        </section>
      ) : null}
    </div>
  );
}
