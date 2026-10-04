import assert from "node:assert/strict";
import test from "node:test";

import { aiFallbackMessage } from "./ai-fallback.ts";

test("an unavailable model shows a bounded fallback", () => {
  const message = aiFallbackMessage("unavailable");
  assert.match(message, /unavailable/);
  assert.equal(message.includes("DISPATCHED"), false);
  assert.equal(aiFallbackMessage("insufficient_context").includes("approved facts"), true);
});
