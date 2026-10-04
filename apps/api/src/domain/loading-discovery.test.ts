import assert from "node:assert/strict";
import test from "node:test";

import { isEligibleLoadingStop } from "./loading-discovery.js";

test("only a confirmed allocated stop without a loading record is discoverable", () => {
  assert.equal(isEligibleLoadingStop({ tripStatus: "CONFIRMED", orderStatus: "PLANNED_ALLOCATED", hasLoadingRecord: false }), true);
  assert.equal(isEligibleLoadingStop({ tripStatus: "PLANNED", orderStatus: "PLANNED_ALLOCATED", hasLoadingRecord: false }), false);
  assert.equal(isEligibleLoadingStop({ tripStatus: "CONFIRMED", orderStatus: "LOADED", hasLoadingRecord: false }), false);
  assert.equal(isEligibleLoadingStop({ tripStatus: "CONFIRMED", orderStatus: "DISPATCHED", hasLoadingRecord: false }), false);
  assert.equal(isEligibleLoadingStop({ tripStatus: "CONFIRMED", orderStatus: "PLANNED_ALLOCATED", hasLoadingRecord: true }), false);
});
