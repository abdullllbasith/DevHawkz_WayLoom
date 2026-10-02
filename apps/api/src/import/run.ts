import { readFile } from "node:fs/promises";
import path from "node:path";

import { parseCsv } from "./csv.js";
import { assertImportDatabaseTarget } from "./database-target.js";
import {
  competitionImportDirectory,
  datasetName,
  discoverHackathonDatasets,
  rejectNonHackathonDataset,
} from "./datasets.js";
import { formatImportSummary, type ImportSummary } from "./identity.js";
import { formatImportIssue, type ImportIssue } from "./issues.js";

export type ImportRunResult = {
  exitCode: number;
  lines: string[];
  database: string | null;
};

export async function runCompetitionImport(input: {
  repoRoot: string;
  env: NodeJS.ProcessEnv;
  requestedFile?: string;
  connect: (connectionString: string) => Promise<{ database: string }>;
}): Promise<ImportRunResult> {
  if (input.requestedFile !== undefined) {
    const rejected = rejectNonHackathonDataset(input.requestedFile);
    if (rejected) {
      return { exitCode: 1, lines: [formatImportIssue(rejected)], database: null };
    }
  }

  let target: { database: string };
  try {
    target = assertImportDatabaseTarget(input.env.DATABASE_URL, input.env.NODE_ENV);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Competition import target was refused.";
    return { exitCode: 1, lines: [message], database: null };
  }

  let connected: { database: string };
  try {
    connected = await input.connect(input.env.DATABASE_URL ?? "");
  } catch {
    return {
      exitCode: 1,
      lines: ["Database connection failed."],
      database: null,
    };
  }
  if (connected.database !== target.database) {
    return {
      exitCode: 1,
      lines: ["Database connection failed."],
      database: null,
    };
  }

  const directory = competitionImportDirectory(input.repoRoot);
  const discovered = await discoverHackathonDatasets(directory);
  const lines = [`database=${connected.database}`];
  if (discovered.errors.length > 0) {
    lines.push(...discovered.errors.map(formatImportIssue));
    return { exitCode: 1, lines, database: connected.database };
  }

  const summaries: ImportSummary[] = [];
  const structuralErrors: ImportIssue[] = [];
  for (const fileName of discovered.present) {
    const dataset = datasetName(fileName);
    const text = await readFile(path.join(directory, fileName), "utf8");
    const parsed = parseCsv(dataset, fileName, text);
    if (parsed.errors.length > 0 || parsed.table === null) {
      structuralErrors.push(...parsed.errors);
      continue;
    }
    summaries.push({
      dataset,
      file: fileName,
      inserted: 0,
      unchanged: 0,
      conflicts: [],
      errors: [],
    });
  }
  if (structuralErrors.length > 0) {
    lines.push(...structuralErrors.map(formatImportIssue));
    return { exitCode: 1, lines, database: connected.database };
  }
  lines.push(
    "Row mapping is deferred. No outlet, vehicle, or calendar records were written.",
  );
  lines.push(...summaries.map(formatImportSummary));
  return { exitCode: 0, lines, database: connected.database };
}
