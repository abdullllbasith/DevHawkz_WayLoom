import Link from "next/link";

import { StatusBadge } from "../status-banner";
import { shortId } from "../../lib/short-id";
import type { StoreOrder } from "../../lib/store-dashboard";

export function StoreDeliveryCard({ order }: { order: StoreOrder }) {
  const delivered = order.status === "DELIVERED";
  return (
    <article className="store-delivery">
      <div className="store-mark" aria-hidden="true">{order.outletCode.slice(0, 3)}</div>
      <div className="store-delivery-main">
        <h2>{order.outletCode}</h2>
        <p>{order.brand} · {order.district} · {order.depot}</p>
        <p>{order.orderDate} · {order.orderUnits} units · {order.tempRequirement}</p>
      </div>
      <div>
        <span>Delivery</span>
        <strong title={order.deliveryId}>{shortId(order.deliveryId)}</strong>
      </div>
      <div>
        <span>Driver, vehicle, arrival</span>
        <strong>Not on this order</strong>
      </div>
      <div className="store-delivery-action">
        <StatusBadge status={order.status} />
        {delivered ? <Link className="store-action" href="/store/receipts">Confirm receipt</Link> : <Link className="store-link" href={`/store/orders/${order.id}`}>Open order</Link>}
      </div>
    </article>
  );
}
