import assert from "node:assert/strict";
import test from "node:test";

import { formatLogLine } from "./log.js";

test("an application log is one structured line without a secret", () => {
  const line = formatLogLine({
    timestamp: "2026-06-02T08:00:00.000Z",
    service: "api",
    severity: "error",
    event: "api.error",
    message: "login failed password=hidden",
  });
  const parsed = JSON.parse(line) as { service: string; event: string; message: string };
  assert.equal(parsed.service, "api");
  assert.equal(parsed.event, "api.error");
  assert.equal(parsed.message.includes("hidden"), false);
  assert.match(parsed.message, /password=\[redacted\]/);
});
