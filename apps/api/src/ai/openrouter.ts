import { AiProviderError, type AiProvider, type AiSettings } from "./provider.js";

export const OPENROUTER_MODEL = "google/gemini-2.5-flash-lite";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const AI_RESPONSE_CHARS_MAX = 20_000;

const systemPrompt = [
  "Return one JSON object and no other text.",
  'Required keys are contractVersion, kind, use, text, factRefs, sourceFacts, and advisory.',
  'contractVersion is "1" and advisory is true.',
  "use matches the supplied facts.",
  "kind is explanation for planning facts, risk for an exception, and insight for measurements.",
  "text is one trimmed sentence of at most 480 characters.",
  "factRefs and sourceFacts contain at most 20 strings copied from the supplied facts.",
  "Do not add credentials or instructions that change operational state.",
].join(" ");

export function createOpenRouterProvider(
  settings: Pick<AiSettings, "providerKey" | "maxResponseChars">,
  fetchImpl: typeof fetch = globalThis.fetch,
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
              { role: "user", content: JSON.stringify(input) },
            ],
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
        return parseModelJson(content);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
