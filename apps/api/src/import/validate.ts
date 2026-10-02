import { type CsvTable } from "./csv.js";
import { type ImportIssue } from "./issues.js";

export function requireHeaders(
  dataset: string,
  file: string,
  table: CsvTable,
  required: readonly string[],
): ImportIssue[] {
  return required
    .filter((header) => !table.headers.includes(header))
    .map((header) => ({
      dataset,
      file,
      row: 1,
      sourceId: null,
      field: header,
      message: "Required column is missing.",
    }));
}

export function sourceIdentity(sourceId: string): string {
  const identity = sourceId.trim();
  if (identity.length === 0) {
    throw new Error("Source identity is empty.");
  }
  return identity;
}

export function duplicateSourceIdentifiers(
  dataset: string,
  file: string,
  table: CsvTable,
  field: string,
): ImportIssue[] {
  const seen = new Map<string, number>();
  const errors: ImportIssue[] = [];
  for (const row of table.rows) {
    const raw = row.values[field] ?? "";
    let identity: string;
    try {
      identity = sourceIdentity(raw);
    } catch {
      errors.push({
        dataset,
        file,
        row: row.rowNumber,
        sourceId: null,
        field,
        message: "Source identifier is empty.",
      });
      continue;
    }
    const previous = seen.get(identity);
    if (previous !== undefined) {
      errors.push({
        dataset,
        file,
        row: row.rowNumber,
        sourceId: identity,
        field,
        message: `Duplicate source identifier. The first row is ${String(previous)}.`,
      });
      continue;
    }
    seen.set(identity, row.rowNumber);
  }
  return errors;
}

export function parseNonNegativeNumber(
  dataset: string,
  file: string,
  row: number,
  sourceId: string | null,
  field: string,
  raw: string,
): { value: number | null; error: ImportIssue | null } {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return {
      value: null,
      error: {
        dataset,
        file,
        row,
        sourceId,
        field,
        message: "Value must be a non-negative number.",
      },
    };
  }
  return { value: Number(trimmed), error: null };
}

export function requireAllowedValue(
  dataset: string,
  file: string,
  row: number,
  sourceId: string | null,
  field: string,
  raw: string,
  allowed: readonly string[],
): ImportIssue | null {
  if (allowed.includes(raw)) {
    return null;
  }
  return {
    dataset,
    file,
    row,
    sourceId,
    field,
    message: "Value is not an approved source value.",
  };
}

export function parseCallerTime(
  dataset: string,
  file: string,
  row: number,
  sourceId: string | null,
  field: string,
  raw: string,
  pattern: "HH:MM" | "YYYY-MM-DD",
): ImportIssue | null {
  const valid =
    pattern === "HH:MM"
      ? /^([01]\d|2[0-3]):[0-5]\d$/.test(raw)
      : /^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(raw);
  if (valid) {
    return null;
  }
  return {
    dataset,
    file,
    row,
    sourceId,
    field,
    message: `Value must match ${pattern}.`,
  };
}
