import { AI_CONTRACT_VERSION, parseAiInput, type ExceptionExplanationInput } from "./input.js";
import { validateAdvisory } from "./boundary.js";
import type { AiAdvisory } from "./output.js";
import { requestAdvisory, type AiProvider, type AiSettings } from "./provider.js";

export type ExceptionExplanation =
  | { ok: true; advisory: AiAdvisory; exceptionChanged: false }
  | { ok: false; code: "insufficient_context" | "unavailable" | "invalid_output"; fallbackText: string; exceptionChanged: false };

const personalPattern = /\b(he|she|they|driver|loader|manager)\b[^.]*\b(careless|negligent|at fault)\b/i;

export async function explainException(input: {
  exception: { id: string; category: string; details: string | null; occurredAt: string };
  capturedAt: string;
  provider: AiProvider;
  settings: Pick<AiSettings, "timeoutMs" | "maxResponseChars">;
}): Promise<ExceptionExplanation> {
  const parsed = parseAiInput({
    contractVersion: AI_CONTRACT_VERSION,
    capturedAt: input.capturedAt,
    use: "exception_explanation",
    exceptionId: input.exception.id,
    category: input.exception.category,
    details: input.exception.details,
    occurredAt: input.exception.occurredAt,
  });
  if (!parsed.ok || !("exceptionId" in parsed.value)) {
    return { ok: false, code: "insufficient_context", fallbackText: "No exception facts were supplied.", exceptionChanged: false };
  }
  const advisory = await requestAdvisory(parsed.value, input.provider, input.settings);
  const checked = advisory.ok ? validateAdvisory(parsed.value, advisory.advisory, input.provider.id) : null;
  if (!advisory.ok || checked === null || !checked.ok || personalPattern.test(checked.advisory.text)) {
    return {
      ok: false,
      code: advisory.ok ? "invalid_output" : "unavailable",
      fallbackText: exceptionFallback(parsed.value),
      exceptionChanged: false,
    };
  }
  return { ok: true, advisory: checked.advisory, exceptionChanged: false };
}

function exceptionFallback(input: ExceptionExplanationInput): string {
  const details = input.details === null || input.details.length === 0 ? "No further details were supplied." : input.details;
  return `Exception ${input.category}. ${details}`;
}
