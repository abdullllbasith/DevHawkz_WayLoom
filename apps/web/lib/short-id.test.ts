import assert from "node:assert/strict";
import test from "node:test";

import { displayRouteLabel, shortId } from "./short-id.ts";

test("shortId keeps business codes and compacts uuids and long delivery ids", () => {
  assert.equal(shortId("VEH035"), "VEH035");
  assert.equal(shortId("RTE-001"), "RTE-001");
  assert.equal(shortId("1a8f690a-3cb0-47aa-9452-f5832bf8d734"), "1a8f690a");
  assert.equal(shortId("SEED-2026-06-02-OUT001"), "06-02-OUT001");
  assert.equal(shortId("—"), "—");
});

test("displayRouteLabel uses the assigned route code and a short fallback for missing or uuid routes", () => {
  assert.equal(displayRouteLabel({ routeId: "RTE-014", tripNumber: 2 }), "RTE-014");
  assert.equal(displayRouteLabel({ routeId: null, tripNumber: 1 }), "RTE-001");
  assert.equal(displayRouteLabel({ routeId: "0e18a809-55ee-413f-b5ba-2b1d9d2267ea", tripNumber: 2 }), "RTE-002");
});
