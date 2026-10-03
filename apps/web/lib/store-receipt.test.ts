import assert from "node:assert/strict";
import test from "node:test";

import { canConfirmReceipt, receiptBody } from "./store-receipt.ts";

test("receipt confirmation is offered only for a delivered order", () => {
  assert.equal(canConfirmReceipt("DELIVERED"), true);
  assert.equal(canConfirmReceipt("LOADED"), false);
  assert.equal(canConfirmReceipt("RECEIPT_CONFIRMED"), false);
});

test("receipt body keeps result and optional issue details", () => {
  assert.deepEqual(receiptBody("accepted", "one case short"), { result: "accepted", issueDetails: "one case short" });
  assert.deepEqual(receiptBody("accepted", ""), { result: "accepted" });
  assert.equal(receiptBody("", "one case short"), null);
  assert.equal("category" in (receiptBody("accepted", "") ?? {}), false);
});
