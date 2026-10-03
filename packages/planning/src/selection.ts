/**
 * Deterministic conflict-free selection among constructed planning trips.
 * Picks trips in stable id order without sharing orders or vehicle/trip slots.
 */
import type { ConstructedTrip } from "./construct.js";

export function selectDeterministicTripIds(trips: readonly ConstructedTrip[]): string[] {
  const selected: string[] = [];
  const usedOrders = new Set<string>();
  const usedSlots = new Set<string>();
  for (const trip of trips) {
    if (trip.orderIds.some((orderId) => usedOrders.has(orderId))) {
      continue;
    }
    const slot = `${trip.vehicleId}\u0000${trip.tripNumber}`;
    if (usedSlots.has(slot)) {
      continue;
    }
    for (const orderId of trip.orderIds) {
      usedOrders.add(orderId);
    }
    usedSlots.add(slot);
    selected.push(trip.id);
  }
  return selected;
}
