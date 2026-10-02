import { type ImportIssue } from "./issues.js";
import { sourceIdentity } from "./validate.js";

export type SourceRecord = {
  sourceId: string;
  values: Record<string, string>;
};

export type ImportSummary = {
  dataset: string;
  file: string;
  inserted: number;
  unchanged: number;
  conflicts: ImportIssue[];
  errors: ImportIssue[];
};

export function sameSourceValues(
  left: Record<string, string>,
  right: Record<string, string>,
): boolean {
  return canonicalSourceValues(left) === canonicalSourceValues(right);
}

export function canonicalSourceValues(values: Record<string, string>): string {
  const entries = Object.entries(values).sort(([left], [right]) =>
    compareSourceKeys(left, right),
  );
  return JSON.stringify(entries);
}

function compareSourceKeys(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

export async function executeImport(input: {
  dataset: string;
  file: string;
  records: SourceRecord[];
  loadExisting: (sourceId: string) => Promise<Record<string, string> | null>;
  write: (record: SourceRecord) => Promise<void>;
  transaction?: (work: () => Promise<void>) => Promise<void>;
}): Promise<ImportSummary> {
  const errors: ImportIssue[] = [];
  const seen = new Set<string>();
  const ordered = [...input.records].sort((left, right) =>
    left.sourceId.trim().localeCompare(right.sourceId.trim()),
  );
  for (const record of ordered) {
    let identity: string;
    try {
      identity = sourceIdentity(record.sourceId);
    } catch {
      errors.push({
        dataset: input.dataset,
        file: input.file,
        row: null,
        sourceId: null,
        field: null,
        message: "Source identifier is empty.",
      });
      continue;
    }
    if (seen.has(identity)) {
      errors.push({
        dataset: input.dataset,
        file: input.file,
        row: null,
        sourceId: identity,
        field: null,
        message: "Duplicate source identifier in the import batch.",
      });
    }
    seen.add(identity);
  }
  if (errors.length > 0) {
    return summary(input.dataset, input.file, 0, 0, [], errors);
  }

  const inserts: SourceRecord[] = [];
  const conflicts: ImportIssue[] = [];
  let unchanged = 0;
  for (const record of ordered) {
    const identity = sourceIdentity(record.sourceId);
    const existing = await input.loadExisting(identity);
    if (existing === null) {
      inserts.push({ sourceId: identity, values: record.values });
      continue;
    }
    if (sameSourceValues(existing, record.values)) {
      unchanged += 1;
      continue;
    }
    conflicts.push({
      dataset: input.dataset,
      file: input.file,
      row: null,
      sourceId: identity,
      field: null,
      message:
        "Existing source data conflicts with the incoming record. No records were written.",
    });
  }
  if (conflicts.length > 0) {
    return summary(input.dataset, input.file, 0, unchanged, conflicts, []);
  }

  const writeAll = async (): Promise<void> => {
    for (const record of inserts) {
      await input.write(record);
    }
  };
  if (inserts.length > 0) {
    if (input.transaction) {
      await input.transaction(writeAll);
    } else {
      await writeAll();
    }
  }
  return summary(input.dataset, input.file, inserts.length, unchanged, [], []);
}

export function formatImportSummary(summary: ImportSummary): string {
  const lines = [
    `dataset=${summary.dataset}`,
    `file=${summary.file}`,
    `inserted=${String(summary.inserted)}`,
    `unchanged=${String(summary.unchanged)}`,
    `conflicts=${String(summary.conflicts.length)}`,
    `errors=${String(summary.errors.length)}`,
  ];
  for (const issue of summary.conflicts) {
    lines.push(`conflict source=${issue.sourceId ?? "-"} ${issue.message}`);
  }
  for (const issue of summary.errors) {
    lines.push(`error source=${issue.sourceId ?? "-"} ${issue.message}`);
  }
  return lines.join("\n");
}

function summary(
  dataset: string,
  file: string,
  inserted: number,
  unchanged: number,
  conflicts: ImportIssue[],
  errors: ImportIssue[],
): ImportSummary {
  return { dataset, file, inserted, unchanged, conflicts, errors };
}
