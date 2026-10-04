import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { chooseOperationalDate, distinctOrderDates } from "./dispatcher-operational-date.ts";

const screens = [
  "app/dispatcher/page.tsx",
  "app/dispatcher/orders/page.tsx",
  "app/dispatcher/planning/page.tsx",
  "app/dispatcher/routes/page.tsx",
];

test("a later order date without a calendar row is not the planning date", () => {
  const chosen = chooseOperationalDate({
    orderDates: ["2026-06-02", "2026-10-05"],
    availableDates: ["2026-06-02", "2026-10-05"],
    selected: null,
  });
  assert.equal(chosen, null);
  assert.notEqual(chosen, "2026-10-05");
});

test("a valid operational date can be selected and is shared by planning, routes, dashboard, and orders", () => {
  const availableDates = ["2026-06-02", "2026-06-27"];
  const selected = chooseOperationalDate({
    orderDates: ["2026-06-02", "2026-06-27", "2026-10-05"],
    availableDates,
    selected: "2026-06-02",
  });
  assert.equal(selected, "2026-06-02");
  for (const screen of screens) {
    const source = readFileSync(new URL(`../${screen}`, import.meta.url), "utf8");
    assert.equal(source.includes("useOperationalDate"), true, screen);
    assert.equal(source.includes("latestOrderDate"), false, screen);
    assert.equal(source.includes("planningDateFromOrders"), false, screen);
  }
});

test("no accepted planning date stays empty", () => {
  assert.deepEqual(distinctOrderDates([{ orderDate: "2026-10-05" }, { orderDate: "not-a-date" }]), ["2026-10-05"]);
  assert.equal(
    chooseOperationalDate({
      orderDates: ["2026-10-05"],
      availableDates: [],
      selected: "2026-10-05",
    }),
    null,
  );
  assert.equal(chooseOperationalDate({ orderDates: [], availableDates: [], selected: null }), null);
});
