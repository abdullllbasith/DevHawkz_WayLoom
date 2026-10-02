import { parseCsv } from "./csv.js";
import { executeImport, type ImportSummary, type SourceRecord } from "./identity.js";
import { type ImportIssue } from "./issues.js";
import { requireHeaders } from "./validate.js";

export const DISTRICT_TRAVEL_FILE = "district_travel.csv";
export const DISTRICT_TRAVEL_DATASET = "district-travel";

const districtTravelHeaders = [
  "district",
  "depot",
  "road_class",
  "free_flow_kmh",
  "depot_to_district_km",
  "depot_to_district_freeflow_min",
  "inter_stop_km",
  "inter_stop_freeflow_min",
] as const;

export type DistrictTravelSourceRow = {
  sourceId: string;
  values: Record<string, string>;
  depot: string;
  district: string;
  roadClass: string;
  freeFlowKmh: string;
  depotToDistrictKm: string;
  depotToDistrictFreeflowMin: string;
  interStopKm: string;
  interStopFreeflowMin: string;
};

export function validateDistrictTravelCsv(text: string): {
  rows: DistrictTravelSourceRow[];
  errors: ImportIssue[];
} {
  const parsed = parseCsv(DISTRICT_TRAVEL_DATASET, DISTRICT_TRAVEL_FILE, text);
  if (parsed.errors.length > 0 || parsed.table === null) {
    return { rows: [], errors: parsed.errors };
  }
  const headerErrors = requireHeaders(
    DISTRICT_TRAVEL_DATASET,
    DISTRICT_TRAVEL_FILE,
    parsed.table,
    districtTravelHeaders,
  );
  const unexpected = parsed.table.headers.filter(
    (header) => !districtTravelHeaders.some((expected) => expected === header),
  );
  const unexpectedErrors = unexpected.map((header) => ({
    dataset: DISTRICT_TRAVEL_DATASET,
    file: DISTRICT_TRAVEL_FILE,
    row: 1,
    sourceId: null,
    field: header,
    message: "Column is not a supplied district-travel source field.",
  }));
  const orderError =
    parsed.table.headers.join(",") === districtTravelHeaders.join(",")
      ? []
      : [
          {
            dataset: DISTRICT_TRAVEL_DATASET,
            file: DISTRICT_TRAVEL_FILE,
            row: 1,
            sourceId: null,
            field: null,
            message: "District-travel columns are not in the supplied source order.",
          },
        ];
  if (headerErrors.length > 0 || unexpectedErrors.length > 0 || orderError.length > 0) {
    return {
      rows: [],
      errors: [...headerErrors, ...unexpectedErrors, ...orderError],
    };
  }

  const rows: DistrictTravelSourceRow[] = [];
  const errors: ImportIssue[] = [];
  const seen = new Map<string, number>();
  for (const row of parsed.table.rows) {
    const mapped = mapDistrictTravelRow(row.rowNumber, row.values);
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
          `Duplicate source identity (depot, district). The first row is ${String(previous)}.`,
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

export async function importValidatedDistrictTravel(input: {
  rows: DistrictTravelSourceRow[];
  loadExisting: (sourceId: string) => Promise<Record<string, string> | null>;
  write: (row: DistrictTravelSourceRow) => Promise<void>;
  transaction?: (work: () => Promise<void>) => Promise<void>;
}): Promise<ImportSummary> {
  const bySourceId = new Map(input.rows.map((row) => [row.sourceId, row]));
  return executeImport({
    dataset: DISTRICT_TRAVEL_DATASET,
    file: DISTRICT_TRAVEL_FILE,
    records: input.rows.map(sourceRecord),
    loadExisting: input.loadExisting,
    write: async (record) => {
      const row = bySourceId.get(record.sourceId);
      if (!row) {
        throw new Error("District-travel source row is missing.");
      }
      await input.write(row);
    },
    transaction: input.transaction,
  });
}

export function districtTravelSourceId(depot: string, district: string): string {
  return JSON.stringify([depot, district]);
}

export function parseDistrictTravelSourceId(sourceId: string): { depot: string; district: string } {
  const parsed: unknown = JSON.parse(sourceId);
  if (!Array.isArray(parsed) || parsed.length !== 2) {
    throw new Error("District-travel source identity is invalid.");
  }
  const [depot, district] = parsed;
  if (typeof depot !== "string" || typeof district !== "string") {
    throw new Error("District-travel source identity is invalid.");
  }
  return { depot, district };
}

function sourceRecord(row: DistrictTravelSourceRow): SourceRecord {
  return { sourceId: row.sourceId, values: row.values };
}

function mapDistrictTravelRow(
  rowNumber: number,
  values: Record<string, string>,
): { row: DistrictTravelSourceRow | null; errors: ImportIssue[] } {
  const errors: ImportIssue[] = [];
  const depot = values.depot ?? "";
  const district = values.district ?? "";
  if (depot.length === 0) {
    errors.push(issue(rowNumber, null, "depot", "Source identity depot is empty."));
  }
  if (district.length === 0) {
    errors.push(issue(rowNumber, null, "district", "Source identity district is empty."));
  }
  if (errors.length > 0) {
    return { row: null, errors };
  }
  return {
    row: {
      sourceId: districtTravelSourceId(depot, district),
      values,
      depot,
      district,
      roadClass: values.road_class ?? "",
      freeFlowKmh: values.free_flow_kmh ?? "",
      depotToDistrictKm: values.depot_to_district_km ?? "",
      depotToDistrictFreeflowMin: values.depot_to_district_freeflow_min ?? "",
      interStopKm: values.inter_stop_km ?? "",
      interStopFreeflowMin: values.inter_stop_freeflow_min ?? "",
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
    dataset: DISTRICT_TRAVEL_DATASET,
    file: DISTRICT_TRAVEL_FILE,
    row,
    sourceId,
    field,
    message,
  };
}
