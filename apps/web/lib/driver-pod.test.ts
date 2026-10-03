import assert from "node:assert/strict";
import test from "node:test";

import { proofBody } from "./driver-pod.ts";

test("proof of delivery stores one evidence reference and no photo type", () => {
  assert.deepEqual(proofBody("ref-1"), { evidenceReference: "ref-1" });
  assert.equal(proofBody("  "), null);
  assert.equal(JSON.stringify(proofBody("ref-1")).includes("signature"), false);
});
