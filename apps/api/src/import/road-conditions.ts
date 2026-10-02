import { existsSync, readFileSync } from "node:fs";

import { parseCsv } from "./csv.js";
import { executeImport, type ImportSummary } from "./identity.js";
import { type ImportIssue } from "./issues.js";
import { requireHeaders } from "./validate.js";

export const ROAD_CONDITIONS_FILE = "road_conditions.csv";
export const ROAD_CONDITIONS_DATASET = "road-conditions";

const roadConditionsHeaders = ["district", "date", "disruption_index"] as const;

export type RoadConditionsSourceRow = {
  sourceId: string;
  values: Record<string, string>;
  district: string;
  date: string;
  disruptionIndex: string;
};

export type OptionalSourceRead = { absent: true } | { absent: false; text: string };

export function readOptionalSourceText(filePath: string): OptionalSourceRead {
  if (!existsSync(filePath)) {
    return { absent: true };
  }
  return { absent: false, text: readFileSync(filePath, "utf8") };
}

export function validateRoadConditionsCsv(text: string): {
  rows: RoadConditionsSourceRow[];
  errors: ImportIssue[];
} {
  const parsed = parseCsv(ROAD_CONDITIONS_DATASET, ROAD_CONDITIONS_FILE, text);
  if (parsed.errors.length > 0 || parsed.table === null) {
    return { rows: [], errors: parsed.errors };
  }
  const headerErrors = requireHeaders(
    ROAD_CONDITIONS_DATASET,
    ROAD_CONDITIONS_FILE,
    parsed.table,
    roadConditionsHeaders,
  );
  const unexpected = parsed.table.headers.filter(
    (header) => !roadConditionsHeaders.some((expected) => expected === header),
  );
  const unexpectedErrors = unexpected.map((header) => ({
    dataset: ROAD_CONDITIONS_DATASET,
    file: ROAD_CONDITIONS_FILE,
    row: 1,
    sourceId: null,
    field: header,
    message: "Column is not a supplied road-conditions source field.",
  }));
  const orderError =
    parsed.table.headers.join(",") === roadConditionsHeaders.join(",")
      ? []
      : [
          {
            dataset: ROAD_CONDITIONS_DATASET,
            file: ROAD_CONDITIONS_FILE,
            row: 1,
            sourceId: null,
            field: null,
            message: "Road-conditions columns are not in the supplied source order.",
          },
        ];
  if (headerErrors.length > 0 || unexpectedErrors.length > 0 || orderError.length > 0) {
    return {
      rows: [],
      errors: [...headerErrors, ...unexpectedErrors, ...orderError],
    };
  }

  const rows: RoadConditionsSourceRow[] = [];
  const errors: ImportIssue[] = [];
  const seen = new Map<string, number>();
  for (const row of parsed.table.rows) {
    const mapped = mapRoadConditionsRow(row.rowNumber, row.values);
    errors.push(...mapped.errors);
    if (!mapped.row) {
      continue;
    }
    const previous = seen.get(mapped.row.sourceId);
    if (previous !== undefined) {
      errors.push(
        issue(
          row.rowNumber,
          mapped.row.sourceId,
          null,
          `Duplicate source identity (district, date). The first row is ${String(previous)}.`,
        ),
      );
      continue;
    }
    seen.set(mapped.row.sourceId, row.rowNumber);
    rows.push(mapped.row);
  }
  if (errors.length > 0) {
    return { rows: [], errors };
  }
  return { rows, errors: [] };
}

export async function importValidatedRoadConditions(input: {
  rows: RoadConditionsSourceRow[];
  loadExisting: (sourceId: string) => Promise<Record<string, string> | null>;
  write: (row: RoadConditionsSourceRow) => Promise<void>;
  transaction?: (work: () => Promise<void>) => Promise<void>;
}): Promise<ImportSummary> {
  const bySourceId = new Map(input.rows.map((row) => [row.sourceId, row]));
  return executeImport({
    dataset: ROAD_CONDITIONS_DATASET,
    file: ROAD_CONDITIONS_FILE,
    records: input.rows.map((row) => ({ sourceId: row.sourceId, values: row.values })),
    loadExisting: input.loadExisting,
    write: async (record) => {
      const row = bySourceId.get(record.sourceId);
      if (!row) {
        throw new Error("Road-conditions source row is missing.");
      }
      await input.write(row);
    },
    transaction: input.transaction,
  });
}

export function roadConditionsSourceId(district: string, date: string): string {
  return JSON.stringify([district, date]);
}

export function parseRoadConditionsSourceId(sourceId: string): { district: string; date: string } {
  const parsed: unknown = JSON.parse(sourceId);
  if (!Array.isArray(parsed) || parsed.length !== 2) {
    throw new Error("Road-conditions source identity is invalid.");
  }
  const [district, date] = parsed;
  if (typeof district !== "string" || typeof date !== "string") {
    throw new Error("Road-conditions source identity is invalid.");
  }
  return { district, date };
}

function mapRoadConditionsRow(
  rowNumber: number,
  values: Record<string, string>,
): { row: RoadConditionsSourceRow | null; errors: ImportIssue[] } {
  const errors: ImportIssue[] = [];
  const district = values.district ?? "";
  const date = values.date ?? "";
  if (district.length === 0) {
    errors.push(issue(rowNumber, null, "district", "Source identity district is empty."));
  }
  if (date.length === 0) {
    errors.push(issue(rowNumber, null, "date", "Source identity date is empty."));
  }
  if (errors.length > 0) {
    return { row: null, errors };
  }
  return {
    row: {
      sourceId: roadConditionsSourceId(district, date),
      values,
      district,
      date,
      disruptionIndex: values.disruption_index ?? "",
    },
    errors: [],
  };
}

function issue(
  row: number,
  sourceId: string | null,
  field: string | null,
  message: string,
): ImportIssue {
  return {
    dataset: ROAD_CONDITIONS_DATASET,
    file: ROAD_CONDITIONS_FILE,
    row,
    sourceId,
    field,
    message,
  };
}
