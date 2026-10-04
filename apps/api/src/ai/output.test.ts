import assert from "node:assert/strict";
import test from "node:test";

import { AI_CONTRACT_VERSION } from "./input.js";
import { parseAiOutput } from "./output.js";

function advisory(extra: Record<string, unknown> = {}) {
  return {
    contractVersion: AI_CONTRACT_VERSION,
    kind: "explanation",
    use: "planning_explanation",
    text: "Order deferred for NO_CAPACITY.",
    factRefs: ["55555555-5555-4555-8555-555555555555"],
    sourceFacts: ["NO_CAPACITY"],
    advisory: true,
    ...extra,
  };
}

test("a bounded advisory output is accepted and is not a domain command", () => {
  const parsed = parseAiOutput(advisory());
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.equal(parsed.value.advisory, true);
  assert.equal("status" in parsed.value, false);
});

test("unknown fields, an instruction, and a false advisory flag are rejected", () => {
  assert.equal(parseAiOutput(advisory({ status: "DISPATCHED" })).ok, false);
  assert.equal(parseAiOutput(advisory({ text: "POST /api/orders/1/confirm" })).ok, false);
  assert.equal(parseAiOutput(advisory({ advisory: false })).ok, false);
  assert.equal(parseAiOutput(advisory({ kind: "allocation" })).ok, false);
});
