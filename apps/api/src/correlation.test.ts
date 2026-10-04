import assert from "node:assert/strict";
import test from "node:test";

import { resolveCorrelationId, withCorrelation } from "./correlation.js";
import { createLogger } from "./log.js";

test("a client request id is kept only when it is safe diagnostic text", () => {
  assert.equal(resolveCorrelationId("req-123456"), "req-123456");
  assert.notEqual(resolveCorrelationId("short"), "short");
  assert.notEqual(resolveCorrelationId("password-value"), "password-value");
  assert.equal(resolveCorrelationId(undefined).includes(" "), false);
});

test("structured logs carry the active correlation id", () => {
  const lines: string[] = [];
  const original = console.info;
  console.info = (line: unknown) => {
    lines.push(String(line));
  };
  try {
    const log = createLogger("info");
    withCorrelation("req-123456", () => {
      log.info("planning started");
    });
  } finally {
    console.info = original;
  }
  const parsed = JSON.parse(lines[0] ?? "{}") as { correlationId?: string; message?: string };
  assert.equal(parsed.correlationId, "req-123456");
  assert.equal(parsed.message, "planning started");
});
