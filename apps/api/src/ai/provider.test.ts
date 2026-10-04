import assert from "node:assert/strict";
import test from "node:test";

import { AI_CONTRACT_VERSION } from "./input.js";
import { createOpenRouterProvider, planningGreetingReply } from "./openrouter.js";
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

const advisory = {
  contractVersion: AI_CONTRACT_VERSION,
  kind: "explanation",
  use: "planning_explanation",
  text: "Planning 2026-06-02: served 0, deferred 0.",
  factRefs: [],
  sourceFacts: [],
  advisory: true,
};

test("a greeting does not recite the allocation", () => {
  assert.equal(
    planningGreetingReply("hi", "2026-06-02"),
    "Hello. I can answer questions about the stored plan for 2026-06-02. Ask which vehicle served an order, or whether anything was deferred.",
  );
  assert.equal(planningGreetingReply("Hello there", "2026-06-02")?.startsWith("Hello."), true);
  assert.equal(planningGreetingReply("what about our current plan", "2026-06-02"), null);
});

test("openrouter is selected only when enabled and keeps the key off public settings", () => {
  const settings = loadAiSettings({
    AI_ENABLED: "true",
    AI_PROVIDER: "openrouter",
    AI_PROVIDER_API_KEY: "server-only-key",
  });
  const visible = JSON.stringify(publicAiSettings(settings));
  assert.equal(settings.providerId, "openrouter");
  assert.equal(selectAiProvider(settings).id, "openrouter");
  assert.equal(visible.includes("server-only-key"), false);
  assert.equal(loadAiSettings({ AI_PROVIDER: "openrouter" }).providerId, "openrouter");
  assert.equal(selectAiProvider(loadAiSettings({ AI_PROVIDER: "openrouter" })).id, "disabled");
  assert.equal(loadAiSettings({ AI_ENABLED: "true", AI_PROVIDER: "openai" }).providerId, "disabled");
});

test("openrouter validates a mocked completion and does not call the network without a key", async () => {
  const settings = loadAiSettings({
    AI_ENABLED: "true",
    AI_PROVIDER: "openrouter",
    AI_PROVIDER_API_KEY: "server-only-key",
    AI_MAX_RESPONSE_CHARS: "4000",
  });
  let calls = 0;
  const fetchImpl: typeof fetch = async (url, init) => {
    calls += 1;
    const body = JSON.parse(String(init?.body));
    const headers = init?.headers as Record<string, string>;
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(init?.method, "POST");
    assert.equal(body.model, "google/gemini-2.5-flash-lite");
    assert.equal(JSON.stringify(body).includes("server-only-key"), false);
    assert.equal(headers.authorization, "Bearer server-only-key");
    return Response.json({ choices: [{ message: { content: JSON.stringify(advisory) } }] });
  };
  const accepted = await requestAdvisory(input, createOpenRouterProvider(settings, fetchImpl), settings);
  assert.equal(accepted.ok, true);
  if (accepted.ok) {
    assert.equal(accepted.advisory.text, advisory.text);
    assert.equal(accepted.advisory.use, "planning_explanation");
  }
  assert.equal(calls, 1);
  const asked: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
    assert.equal(body.messages[1]?.content.includes("Why was the order deferred?"), true);
    assert.equal(body.messages[1]?.content.includes("server-only-key"), false);
    return Response.json({ choices: [{ message: { content: JSON.stringify({ ...advisory, text: "The stored plan does not include a fuel figure." }) } }] });
  };
  const answered = await requestAdvisory(input, createOpenRouterProvider(settings, asked, "Why was the order deferred?"), settings);
  assert.equal(answered.ok, true);
  if (answered.ok) assert.equal(answered.advisory.text, "The stored plan does not include a fuel figure.");
  const orderId = "11111111-1111-4111-8111-111111111111";
  const labeledFetch: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
    assert.equal(body.messages[1]?.content.includes("SEED-2026-06-02-OUT001"), true);
    assert.equal(body.messages[1]?.content.includes("What about the current plan?"), true);
    return Response.json({ choices: [{ message: { content: JSON.stringify({ ...advisory, text: `Vehicle VEH035 served order ${orderId}.` }) } }] });
  };
  const labeled = await requestAdvisory(input, createOpenRouterProvider(settings, labeledFetch, "What about the current plan?", [{
    orderId,
    orderLabel: "SEED-2026-06-02-OUT001",
    outletCode: "OUT001",
    vehicleId: "VEH035",
    tripNumber: 1,
    depot: "Peliyagoda",
  }]), settings);
  assert.equal(labeled.ok, true);
  if (labeled.ok) {
    assert.equal(labeled.advisory.text.includes(orderId), false);
    assert.equal(labeled.advisory.text.includes("SEED-2026-06-02-OUT001"), true);
  }
  const missingKey = loadAiSettings({ AI_ENABLED: "true", AI_PROVIDER: "openrouter" });
  const blocked = await requestAdvisory(input, selectAiProvider(missingKey), missingKey);
  assert.deepEqual(blocked, { ok: false, code: "unavailable" });
  assert.equal(calls, 1);
});

test("openrouter failures stay on the existing degraded results", async () => {
  const settings = loadAiSettings({
    AI_ENABLED: "true",
    AI_PROVIDER: "openrouter",
    AI_PROVIDER_API_KEY: "server-only-key",
    AI_TIMEOUT_MS: "100",
    AI_MAX_RESPONSE_CHARS: "200",
  });
  const statusFetch = (status: number): typeof fetch => async () => new Response("no", { status });
  assert.deepEqual(await requestAdvisory(input, createOpenRouterProvider(settings, statusFetch(429)), settings), { ok: false, code: "rate_limit" });
  assert.deepEqual(await requestAdvisory(input, createOpenRouterProvider(settings, statusFetch(503)), settings), { ok: false, code: "provider_error" });
  const invalidFetch: typeof fetch = async () => Response.json({ choices: [{ message: { content: "not-json" } }] });
  assert.deepEqual(await requestAdvisory(input, createOpenRouterProvider(settings, invalidFetch), settings), { ok: false, code: "invalid_output" });
  const downFetch: typeof fetch = async () => Promise.reject(new Error("down"));
  assert.deepEqual(await requestAdvisory(input, createOpenRouterProvider(settings, downFetch), settings), { ok: false, code: "provider_error" });
  const slowFetch: typeof fetch = (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      reject(new DOMException("The operation was aborted.", "AbortError"));
    });
  });
  assert.deepEqual(await requestAdvisory(input, createOpenRouterProvider(settings, slowFetch), settings), { ok: false, code: "timeout" });
});
