import assert from "node:assert/strict";
import test from "node:test";

import { AI_CONTRACT_VERSION } from "./input.js";
import {
  AiProviderError,
  loadAiSettings,
  publicAiSettings,
  requestAdvisory,
  safeProviderLog,
  selectAiProvider,
  type AiProvider,
} from "./provider.js";

const input = {
  contractVersion: AI_CONTRACT_VERSION,
  capturedAt: "2026-06-02T08:00:00.000Z",
  operationalDate: "2026-06-02",
  served: [],
  deferred: [],
};

test("provider settings keep the key on the server", () => {
  const settings = loadAiSettings({ AI_ENABLED: "true", AI_PROVIDER: "deterministic", AI_PROVIDER_API_KEY: "server-only-key" });
  const visible = JSON.stringify(publicAiSettings(settings));
  assert.equal(visible.includes("server-only-key"), false);
  assert.equal(selectAiProvider(settings).id, "deterministic");
  assert.equal(safeProviderLog("accepted", settings.providerId).includes("server-only-key"), false);
});

test("a disabled provider returns a controlled failure", async () => {
  const settings = loadAiSettings({});
  const result = await requestAdvisory(input, selectAiProvider(settings), settings);
  assert.deepEqual(result, { ok: false, code: "unavailable" });
});

test("the deterministic provider is validated and a timeout is bounded", async () => {
  const settings = loadAiSettings({ AI_ENABLED: "true", AI_PROVIDER: "deterministic", AI_TIMEOUT_MS: "100" });
  const accepted = await requestAdvisory(input, selectAiProvider(settings), settings);
  assert.equal(accepted.ok, true);
  const slow: AiProvider = {
    id: "slow",
    complete() {
      return new Promise(() => undefined);
    },
  };
  const timedOut = await requestAdvisory(input, slow, settings);
  assert.deepEqual(timedOut, { ok: false, code: "timeout" });
  const limited: AiProvider = {
    id: "limited",
    complete() {
      return Promise.reject(new AiProviderError("rate_limit"));
    },
  };
  assert.deepEqual(await requestAdvisory(input, limited, settings), { ok: false, code: "rate_limit" });
});
