import { AI_CONTRACT_VERSION, type AiUse } from "./input.js";

export const aiOutputKinds = ["explanation", "risk", "insight", "recommendation"] as const;

export type AiOutputKind = (typeof aiOutputKinds)[number];

export const AI_TEXT_LIMIT = 480;

export type AiAdvisory = {
  contractVersion: typeof AI_CONTRACT_VERSION;
  kind: AiOutputKind;
  use: AiUse;
  text: string;
  factRefs: string[];
  sourceFacts: string[];
  advisory: true;
};

const instructionPattern = /\b(post|put|patch|delete)\s+\//i;
const secretPattern = /password|token|secret|cookie|authorization|api[_-]?key/i;

export function parseAiOutput(value: unknown): { ok: true; value: AiAdvisory } | { ok: false } {
  if (containsSecret(value) || !isRecord(value)) {
    return { ok: false };
  }
  if (!sameKeys(value, ["contractVersion", "kind", "use", "text", "factRefs", "sourceFacts", "advisory"])) {
    return { ok: false };
  }
  if (value.contractVersion !== AI_CONTRACT_VERSION || value.advisory !== true) {
    return { ok: false };
  }
  if (!kind(value.kind) || !use(value.use) || !text(value.text) || !stringList(value.factRefs) || !stringList(value.sourceFacts)) {
    return { ok: false };
  }
  if (instructionPattern.test(value.text)) {
    return { ok: false };
  }
  return {
    ok: true,
    value: {
      contractVersion: AI_CONTRACT_VERSION,
      kind: value.kind,
      use: value.use,
      text: value.text,
      factRefs: value.factRefs,
      sourceFacts: value.sourceFacts,
      advisory: true,
    },
  };
}

function containsSecret(value: unknown): boolean {
  return secretPattern.test(JSON.stringify(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function kind(value: unknown): value is AiOutputKind {
  return typeof value === "string" && aiOutputKinds.some((item) => item === value);
}

function use(value: unknown): value is AiUse {
  return value === "planning_explanation" || value === "exception_explanation" || value === "operational_insight";
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= AI_TEXT_LIMIT && value.trim() === value;
}

function stringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 20 && value.every((item) => typeof item === "string" && item.length > 0 && item.length <= 80);
}
