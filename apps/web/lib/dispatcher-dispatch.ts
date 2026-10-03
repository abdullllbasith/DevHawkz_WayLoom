export function tripReadyToDispatch(input: {
  stops: readonly { orderId: string }[];
  orderStatus: (orderId: string) => string | undefined;
}): boolean {
  if (input.stops.length === 0) {
    return false;
  }
  return input.stops.every((stop) => input.orderStatus(stop.orderId) === "LOADED");
}
