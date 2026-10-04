import type { AiInput } from "./input.js";
import { AI_CONTRACT_VERSION, aiInputUse } from "./input.js";
import type { AiAdvisory } from "./output.js";
import { parseAiOutput } from "./output.js";

export type AiProviderCode = "unavailable" | "timeout" | "rate_limit" | "provider_error" | "invalid_output";

export type AiProviderResult =
  | { ok: true; advisory: AiAdvisory }
  | { ok: false; code: AiProviderCode };

export type AiProvider = {
  id: string;
  complete(input: AiInput, signal: AbortSignal): Promise<unknown>;
};

export type AiSettings = {
  enabled: boolean;
  providerId: "disabled" | "deterministic";
  timeoutMs: number;
  maxResponseChars: number;
  providerKey: string | null;
};

export type PublicAiSettings = Omit<AiSettings, "providerKey">;

export class AiProviderError extends Error {
  constructor(readonly code: Exclude<AiProviderCode, "invalid_output" | "timeout">) {
    super(code);
  }
}

export function loadAiSettings(env: Record<string, string | undefined>): AiSettings {
  const timeoutMs = boundedInteger(env.AI_TIMEOUT_MS, 2000, 100, 10_000);
  const maxResponseChars = boundedInteger(env.AI_MAX_RESPONSE_CHARS, 4000, 200, 20_000);
  return {
    enabled: env.AI_ENABLED === "true",
    providerId: env.AI_PROVIDER === "deterministic" ? "deterministic" : "disabled",
    timeoutMs,
    maxResponseChars,
    providerKey: env.AI_PROVIDER_API_KEY ?? null,
  };
}

export function publicAiSettings(settings: AiSettings): PublicAiSettings {
  return {
    enabled: settings.enabled,
    providerId: settings.providerId,
    timeoutMs: settings.timeoutMs,
    maxResponseChars: settings.maxResponseChars,
  };
}

export function selectAiProvider(settings: AiSettings): AiProvider {
  if (!settings.enabled || settings.providerId === "disabled") {
    return disabledProvider;
  }
  return deterministicProvider;
}

export async function requestAdvisory(
  input: AiInput,
  provider: AiProvider,
  settings: Pick<AiSettings, "timeoutMs" | "maxResponseChars">,
): Promise<AiProviderResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
  try {
    const raw = await Promise.race([
      provider.complete(input, controller.signal),
      timeout(settings.timeoutMs, controller.signal),
    ]);
    if (raw === "timeout") {
      return { ok: false, code: "timeout" };
    }
    if (JSON.stringify(raw).length > settings.maxResponseChars) {
      return { ok: false, code: "invalid_output" };
    }
    const parsed = parseAiOutput(raw);
    if (!parsed.ok || parsed.value.use !== aiInputUse(input)) {
      return { ok: false, code: "invalid_output" };
    }
    return { ok: true, advisory: parsed.value };
  } catch (error) {
    if (error instanceof AiProviderError) {
      return { ok: false, code: error.code };
    }
    return { ok: false, code: "provider_error" };
  } finally {
    clearTimeout(timer);
  }
}

export function safeProviderLog(code: AiProviderCode | "accepted", providerId: string): string {
  return `ai provider=${providerId} result=${code}`;
}

const disabledProvider: AiProvider = {
  id: "disabled",
  complete() {
    return Promise.reject(new AiProviderError("unavailable"));
  },
};

const deterministicProvider: AiProvider = {
  id: "deterministic",
  complete(input) {
    return Promise.resolve(deterministicAdvisory(input));
  },
};

function deterministicAdvisory(input: AiInput): unknown {
  if ("served" in input) {
    const fact = input.deferred[0]?.deferralReason ?? input.deferred[0]?.constraint ?? null;
    return {
      contractVersion: AI_CONTRACT_VERSION,
      kind: "explanation",
      use: "planning_explanation",
      text: `Planning ${input.operationalDate}: served ${input.served.length}, deferred ${input.deferred.length}.`,
      factRefs: [...input.served, ...input.deferred].map((item) => item.orderId).slice(0, 20),
      sourceFacts: fact === null ? [] : [fact],
      advisory: true,
    };
  }
  if ("exceptionId" in input) {
    return {
      contractVersion: AI_CONTRACT_VERSION,
      kind: "risk",
      use: "exception_explanation",
      text: input.details === null ? `Exception ${input.category}.` : `Exception ${input.category}: ${input.details}`,
      factRefs: [input.exceptionId],
      sourceFacts: [input.category],
      advisory: true,
    };
  }
  const metric = input.metrics[0];
  return {
    contractVersion: AI_CONTRACT_VERSION,
    kind: "insight",
    use: "operational_insight",
    text: metric === undefined ? "No approved measurements." : `Decision support: ${metric.metric} is ${metric.value}.`,
    factRefs: [],
    sourceFacts: metric === undefined ? [] : [metric.metric],
    advisory: true,
  };
}

function timeout(timeoutMs: number, signal: AbortSignal): Promise<"timeout"> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("timeout"), timeoutMs);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve("timeout");
    });
  });
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return fallback;
  }
  return parsed;
}
