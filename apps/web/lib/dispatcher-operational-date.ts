const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function distinctOrderDates(orders: readonly { orderDate: string }[]): string[] {
  return [...new Set(orders.map((order) => order.orderDate).filter((date) => datePattern.test(date)))].sort();
}

/**
 * Operational dates come from dates the dispatcher can already see.
 * Nothing is chosen automatically: the latest order date is not a planning date.
 * An explicit selection is kept only when it is still one of those dates.
 */
export function chooseOperationalDate(input: {
  orderDates: readonly string[];
  availableDates: readonly string[];
  selected: string | null;
}): string | null {
  const available = new Set(input.availableDates.filter((date) => datePattern.test(date)));
  const candidates = distinctOrderDates(input.orderDates.map((orderDate) => ({ orderDate }))).filter((date) => available.has(date));
  if (input.selected !== null && candidates.includes(input.selected)) return input.selected;
  return null;
}
