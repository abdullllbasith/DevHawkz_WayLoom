import assert from "node:assert/strict";
import test from "node:test";

import { deliveryOutcomeBody } from "./driver-delivery.ts";

test("delivery outcome keeps free text and optional units", () => {
  assert.deepEqual(deliveryOutcomeBody({ outcome: "left at gate", deliveredUnits: "", notes: "" }), { outcome: "left at gate" });
  assert.equal(deliveryOutcomeBody({ outcome: "  ", deliveredUnits: "", notes: "" }), null);
  assert.equal(deliveryOutcomeBody({ outcome: "left at gate", deliveredUnits: "-1", notes: "" }), null);
  assert.equal(JSON.stringify(deliveryOutcomeBody({ outcome: "delivered", deliveredUnits: "2", notes: "note" })).includes("DELIVERED"), false);
});
