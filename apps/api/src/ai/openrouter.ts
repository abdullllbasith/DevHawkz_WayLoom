import { aiInputUse, type AiInput } from "./input.js";
import { AI_TEXT_LIMIT } from "./output.js";
import { AiProviderError, type AiProvider, type AiSettings } from "./provider.js";

export const OPENROUTER_MODEL = "google/gemini-2.5-flash-lite";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const AI_RESPONSE_CHARS_MAX = 20_000;

const systemPrompt = [
  "Return one JSON object and no markdown.",
  "Keys are exactly contractVersion, kind, use, text, factRefs, sourceFacts, and advisory.",
  'contractVersion is "1" and advisory is true.',
  "use is planning_explanation, exception_explanation, or operational_insight and must match the supplied facts.",
  "kind is explanation, risk, or insight for those uses.",
  "text is at most two trimmed sentences and at most 480 characters about only the supplied facts.",
  "factRefs must be orderId or exceptionId values copied from the input. sourceFacts must be deferralReason, constraint, or metric values copied from the input.",
  "Use empty arrays when the input has no matching values.",
  "Do not add credentials or instructions that change operational state.",
  "In text, name an order by its orderLabel and put the word order before that label. Never write the UUID orderId, and never begin a sentence with the order label.",
  "If the question is only a greeting, answer with a short greeting and invite a question about the stored plan. Do not mention vehicles, orders, depots, or deferrals.",
  "If the question asks about the current plan, summarize the operational date, each vehicle, trip number, depot, order label, outlet, and whether any order was deferred.",
  "For any other question, answer only that question from the supplied facts.",
  "If those facts do not contain the answer, say the planning result does not include it.",
  "Say an order was served by its vehicle. Do not say it was delivered.",
  "When deferred is empty, say that no orders were deferred. Do not say the explanation is unavailable when served or deferred facts are present.",
  "Do not invent fuel, distance, on-time percentage, utilization, or a different allocation.",
].join(" ");

const greetingPattern = /^(?:hi|hello|hey|hiya|yo|good morning|good afternoon|good evening)(?:[.!,\s]+there)?[.!]*$/i;

export function planningGreetingReply(question: string, operationalDate: string): string | null {
  if (!greetingPattern.test(question)) return null;
  return `Hello. I can answer questions about the stored plan for ${operationalDate}. Ask which vehicle served an order, or whether anything was deferred.`;
}

export type PlanningOrderLabel = {
  orderId: string;
  orderLabel: string;
  outletCode: string;
  vehicleId: string | null;
  tripNumber: number | null;
  depot: string | null;
};

export function createOpenRouterProvider(
  settings: Pick<AiSettings, "providerKey" | "maxResponseChars">,
  fetchImpl: typeof fetch = globalThis.fetch,
  question?: string,
  orderLabels: readonly PlanningOrderLabel[] = [],
): AiProvider {
  return {
    id: "openrouter",
    async complete(input, signal) {
      const key = settings.providerKey?.trim() ?? "";
      if (key === "") {
        throw new AiProviderError("unavailable");
      }
      try {
        const response = await fetchImpl(OPENROUTER_URL, {
          method: "POST",
          headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: OPENROUTER_MODEL,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: JSON.stringify(question === undefined ? { facts: input, orderLabels } : { facts: input, question, orderLabels }) },
            ],
            response_format: { type: "json_object" },
            max_tokens: 300,
          }),
          signal,
        });
        if (response.status === 429) {
          throw new AiProviderError("rate_limit");
        }
        if (!response.ok) {
          throw new AiProviderError("provider_error");
        }
        const body = await response.text();
        if (body.length > AI_RESPONSE_CHARS_MAX) {
          throw new AiProviderError("provider_error");
        }
        const content = modelContent(body);
        if (content === null || content.length > settings.maxResponseChars) {
          throw new AiProviderError("provider_error");
        }
        return normalizeAdvisory(input, parseModelJson(content), orderLabels);
      } catch (error) {
        if (error instanceof AiProviderError) {
          throw error;
        }
        if (signal.aborted) {
          return new Promise(() => undefined);
        }
        throw new AiProviderError("provider_error");
      }
    },
  };
}

function modelContent(body: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.choices) || parsed.choices.length === 0) {
    return null;
  }
  const choice = parsed.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) {
    return null;
  }
  const content = choice.message.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return null;
  }
  const text = content.map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : "")).join("");
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}

function parseModelJson(content: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(content.slice(start, end + 1)) as unknown;
      } catch {
        return content;
      }
    }
    return content;
  }
}

function normalizeAdvisory(input: AiInput, value: unknown, orderLabels: readonly PlanningOrderLabel[]): unknown {
  const use = aiInputUse(input);
  const kind = use === "exception_explanation" ? "risk" : use === "operational_insight" ? "insight" : "explanation";
  const record = isRecord(value) ? value : {};
  const text = typeof record.text === "string" ? applyOrderLabels(record.text, orderLabels) : "";
  const allowedRefs = factRefsFor(input);
  const allowedFacts = sourceFactsFor(input);
  return {
    contractVersion: "1",
    kind,
    use,
    text,
    factRefs: listed(record.factRefs).filter((item) => allowedRefs.has(item)).slice(0, 20),
    sourceFacts: listed(record.sourceFacts).filter((item) => allowedFacts.has(item)).slice(0, 20),
    advisory: true,
  };
}

function applyOrderLabels(text: string, orderLabels: readonly PlanningOrderLabel[]): string {
  let next = text;
  for (const label of orderLabels) {
    if (label.orderId.length > 0 && label.orderLabel.length > 0) {
      next = next.split(label.orderId).join(label.orderLabel);
    }
  }
  next = next.replace(/\s+/g, " ").trim();
  for (const label of orderLabels) {
    if (label.orderLabel.length > 0 && next.startsWith(label.orderLabel)) {
      next = `Order ${next}`;
      break;
    }
  }
  return next.slice(0, AI_TEXT_LIMIT);
}

function factRefsFor(input: AiInput): Set<string> {
  if ("served" in input) {
    return new Set([...input.served, ...input.deferred].map((item) => item.orderId));
  }
  if ("exceptionId" in input) {
    return new Set([input.exceptionId]);
  }
  return new Set();
}

function sourceFactsFor(input: AiInput): Set<string> {
  if ("served" in input) {
    return new Set(input.deferred.flatMap((item) => item.deferralReason === null ? [item.constraint] : [item.constraint, item.deferralReason]));
  }
  if ("exceptionId" in input) {
    return new Set([input.category]);
  }
  return new Set(input.metrics.map((item) => item.metric));
}

function listed(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
