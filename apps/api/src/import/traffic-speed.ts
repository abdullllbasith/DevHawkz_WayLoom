import { existsSync, readFileSync } from "node:fs";

import { parseCsv } from "./csv.js";
import { executeImport, type ImportSummary } from "./identity.js";
import { type ImportIssue } from "./issues.js";
import { requireHeaders } from "./validate.js";

export const TRAFFIC_SPEED_FILE = "traffic_speed.csv";
export const TRAFFIC_SPEED_DATASET = "traffic-speed";

const trafficSpeedHeaders = ["district", "hour", "monsoon", "speed_index"] as const;

export type TrafficSpeedSourceRow = {
  sourceId: string;
  values: Record<string, string>;
  district: string;
  hour: string;
  monsoon: string;
  speedIndex: string;
};

export type OptionalSourceRead = { absent: true } | { absent: false; text: string };

export function readOptionalSourceText(filePath: string): OptionalSourceRead {
  if (!existsSync(filePath)) {
    return { absent: true };
  }
  return { absent: false, text: readFileSync(filePath, "utf8") };
}

export function validateTrafficSpeedCsv(text: string): {
  rows: TrafficSpeedSourceRow[];
  errors: ImportIssue[];
} {
  const parsed = parseCsv(TRAFFIC_SPEED_DATASET, TRAFFIC_SPEED_FILE, text);
  if (parsed.errors.length > 0 || parsed.table === null) {
    return { rows: [], errors: parsed.errors };
  }
  const headerErrors = requireHeaders(
    TRAFFIC_SPEED_DATASET,
    TRAFFIC_SPEED_FILE,
    parsed.table,
    trafficSpeedHeaders,
  );
  const unexpected = parsed.table.headers.filter(
    (header) => !trafficSpeedHeaders.some((expected) => expected === header),
  );
  const unexpectedErrors = unexpected.map((header) => ({
    dataset: TRAFFIC_SPEED_DATASET,
    file: TRAFFIC_SPEED_FILE,
    row: 1,
    sourceId: null,
    field: header,
    message: "Column is not a supplied traffic-speed source field.",
  }));
  const orderError =
    parsed.table.headers.join(",") === trafficSpeedHeaders.join(",")
      ? []
      : [
          {
            dataset: TRAFFIC_SPEED_DATASET,
            file: TRAFFIC_SPEED_FILE,
            row: 1,
            sourceId: null,
            field: null,
            message: "Traffic-speed columns are not in the supplied source order.",
          },
        ];
  if (headerErrors.length > 0 || unexpectedErrors.length > 0 || orderError.length > 0) {
    return {
      rows: [],
      errors: [...headerErrors, ...unexpectedErrors, ...orderError],
    };
  }

  const rows: TrafficSpeedSourceRow[] = [];
  const errors: ImportIssue[] = [];
  const seen = new Map<string, number>();
  for (const row of parsed.table.rows) {
    const mapped = mapTrafficSpeedRow(row.rowNumber, row.values);
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
          `Duplicate source identity (district, hour, monsoon). The first row is ${String(previous)}.`,
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

export async function importValidatedTrafficSpeed(input: {
  rows: TrafficSpeedSourceRow[];
  loadExisting: (sourceId: string) => Promise<Record<string, string> | null>;
  write: (row: TrafficSpeedSourceRow) => Promise<void>;
  transaction?: (work: () => Promise<void>) => Promise<void>;
}): Promise<ImportSummary> {
  const bySourceId = new Map(input.rows.map((row) => [row.sourceId, row]));
  return executeImport({
    dataset: TRAFFIC_SPEED_DATASET,
    file: TRAFFIC_SPEED_FILE,
    records: input.rows.map((row) => ({ sourceId: row.sourceId, values: row.values })),
    loadExisting: input.loadExisting,
    write: async (record) => {
      const row = bySourceId.get(record.sourceId);
      if (!row) {
        throw new Error("Traffic-speed source row is missing.");
      }
      await input.write(row);
    },
    transaction: input.transaction,
  });
}

export function trafficSpeedSourceId(district: string, hour: string, monsoon: string): string {
  return JSON.stringify([district, hour, monsoon]);
}

export function parseTrafficSpeedSourceId(sourceId: string): {
  district: string;
  hour: string;
  monsoon: string;
} {
  const parsed: unknown = JSON.parse(sourceId);
  if (!Array.isArray(parsed) || parsed.length !== 3) {
    throw new Error("Traffic-speed source identity is invalid.");
  }
  const [district, hour, monsoon] = parsed;
  if (typeof district !== "string" || typeof hour !== "string" || typeof monsoon !== "string") {
    throw new Error("Traffic-speed source identity is invalid.");
  }
  return { district, hour, monsoon };
}

function mapTrafficSpeedRow(
  rowNumber: number,
  values: Record<string, string>,
): { row: TrafficSpeedSourceRow | null; errors: ImportIssue[] } {
  const errors: ImportIssue[] = [];
  const district = values.district ?? "";
  const hour = values.hour ?? "";
  const monsoon = values.monsoon ?? "";
  if (district.length === 0) {
    errors.push(issue(rowNumber, null, "district", "Source identity district is empty."));
  }
  if (hour.length === 0) {
    errors.push(issue(rowNumber, null, "hour", "Source identity hour is empty."));
  }
  if (monsoon.length === 0) {
    errors.push(issue(rowNumber, null, "monsoon", "Source identity monsoon is empty."));
  }
  if (errors.length > 0) {
    return { row: null, errors };
  }
  return {
    row: {
      sourceId: trafficSpeedSourceId(district, hour, monsoon),
      values,
      district,
      hour,
      monsoon,
      speedIndex: values.speed_index ?? "",
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
    dataset: TRAFFIC_SPEED_DATASET,
    file: TRAFFIC_SPEED_FILE,
    row,
    sourceId,
    field,
    message,
  };
}
