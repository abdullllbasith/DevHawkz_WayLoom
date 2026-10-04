import assert from "node:assert/strict";
import test from "node:test";

import { explainException } from "./exception-explanation.js";
import { AI_CONTRACT_VERSION } from "./input.js";
import type { AiProvider } from "./provider.js";

const exceptionId = "77777777-7777-4777-8777-777777777777";
const settings = { timeoutMs: 1000, maxResponseChars: 4000 };
const exception = {
  id: exceptionId,
  category: "shortfall",
  details: "2 units short",
  occurredAt: "2026-06-02T09:00:00.000Z",
};

function provider(text: string, sourceFacts: string[]): AiProvider {
  return {
    id: "test",
    complete: () => Promise.resolve({
      contractVersion: AI_CONTRACT_VERSION,
      kind: "risk",
      use: "exception_explanation",
      text,
      factRefs: [exceptionId],
      sourceFacts,
      advisory: true,
    }),
  };
}

test("an exception explanation stays on the supplied facts", async () => {
  const explained = await explainException({
    exception,
    capturedAt: "2026-06-02T09:01:00.000Z",
    provider: provider("Shortfall recorded: 2 units short.", ["shortfall"]),
    settings,
  });
  assert.equal(explained.ok, true);
  assert.equal(explained.exceptionChanged, false);
});

test("a personal diagnosis falls back to the exception record", async () => {
  const explained = await explainException({
    exception,
    capturedAt: "2026-06-02T09:01:00.000Z",
    provider: provider("The driver is careless.", ["shortfall"]),
    settings,
  });
  assert.equal(explained.ok, false);
  if (explained.ok) {
    return;
  }
  assert.equal(explained.exceptionChanged, false);
  assert.match(explained.fallbackText, /shortfall/);
  assert.match(explained.fallbackText, /2 units short/);
  assert.equal(explained.fallbackText.includes("careless"), false);
});
