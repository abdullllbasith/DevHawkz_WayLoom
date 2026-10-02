import { parseCsv } from "./csv.js";
import { executeImport, type ImportSummary, type SourceRecord } from "./identity.js";
import { type ImportIssue } from "./issues.js";
import {
  duplicateSourceIdentifiers,
  parseCallerTime,
  requireAllowedValue,
  requireHeaders,
  sourceIdentity,
} from "./validate.js";

export const OUTLET_FILE = "outlets.csv";
export const OUTLET_DATASET = "outlets";

const outletHeaders = [
  "outlet_id",
  "brand",
  "district",
  "depot",
  "dock_type",
  "parking_constraint",
  "mall_window",
  "window_open_time",
  "window_close_time",
] as const;

const brands = ["Fresh", "Style", "Tech"] as const;
const depots = ["Peliyagoda", "Kandy"] as const;
const dockTypes = ["rear_dock", "street", "mall_bay"] as const;
const parkingConstraints = ["normal", "van_only", "mall_dock"] as const;

export type OutletSourceRow = {
  sourceId: string;
  values: Record<string, string>;
  brand: (typeof brands)[number];
  district: string;
  depot: (typeof depots)[number];
  dockType: (typeof dockTypes)[number];
  parkingConstraint: (typeof parkingConstraints)[number];
  mallWindow: string | null;
  windowOpenTime: Date;
  windowCloseTime: Date;
};

export function validateOutletCsv(text: string): {
  rows: OutletSourceRow[];
  errors: ImportIssue[];
} {
  const parsed = parseCsv(OUTLET_DATASET, OUTLET_FILE, text);
  if (parsed.errors.length > 0 || parsed.table === null) {
    return { rows: [], errors: parsed.errors };
  }
  const headerErrors = requireHeaders(
    OUTLET_DATASET,
    OUTLET_FILE,
    parsed.table,
    outletHeaders,
  );
  const unexpected = parsed.table.headers.filter(
    (header) => !outletHeaders.some((expected) => expected === header),
  );
  const unexpectedErrors = unexpected.map((header) => ({
    dataset: OUTLET_DATASET,
    file: OUTLET_FILE,
    row: 1,
    sourceId: null,
    field: header,
    message: "Column is not an approved outlet source field.",
  }));
  const orderError =
    parsed.table.headers.join(",") === outletHeaders.join(",")
      ? []
      : headerErrors.length > 0 || unexpectedErrors.length > 0
        ? []
        : [
            {
              dataset: OUTLET_DATASET,
              file: OUTLET_FILE,
              row: 1,
              sourceId: null,
              field: null,
              message: "Outlet columns are not in the supplied source order.",
            },
          ];
  if (headerErrors.length > 0 || unexpectedErrors.length > 0 || orderError.length > 0) {
    return { rows: [], errors: [...headerErrors, ...unexpectedErrors, ...orderError] };
  }

  const duplicateErrors = duplicateSourceIdentifiers(
    OUTLET_DATASET,
    OUTLET_FILE,
    parsed.table,
    "outlet_id",
  );
  const rows: OutletSourceRow[] = [];
  const errors = [...duplicateErrors];
  for (const row of parsed.table.rows) {
    const mapped = mapOutletRow(row.rowNumber, row.values);
    errors.push(...mapped.errors);
    if (mapped.row) {
      rows.push(mapped.row);
    }
  }
  if (errors.length > 0) {
    return { rows: [], errors };
  }
  return { rows, errors: [] };
}

export async function importValidatedOutlets(input: {
  rows: OutletSourceRow[];
  loadExisting: (sourceId: string) => Promise<Record<string, string> | null>;
  write: (row: OutletSourceRow) => Promise<void>;
  transaction?: (work: () => Promise<void>) => Promise<void>;
}): Promise<ImportSummary> {
  const bySourceId = new Map(input.rows.map((row) => [row.sourceId, row]));
  return executeImport({
    dataset: OUTLET_DATASET,
    file: OUTLET_FILE,
    records: input.rows.map(sourceRecord),
    loadExisting: input.loadExisting,
    write: async (record) => {
      const row = bySourceId.get(record.sourceId);
      if (!row) {
        throw new Error("Outlet source row is missing.");
      }
      await input.write(row);
    },
    transaction: input.transaction,
  });
}

export function clockTime(value: string): Date {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) {
    throw new Error("Clock time is invalid.");
  }
  return new Date(Date.UTC(1970, 0, 1, Number(match[1]), Number(match[2]), 0));
}

export function formatClockTime(value: Date): string {
  const hours = String(value.getUTCHours()).padStart(2, "0");
  const minutes = String(value.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function sourceRecord(row: OutletSourceRow): SourceRecord {
  return { sourceId: row.sourceId, values: row.values };
}

function mapOutletRow(
  rowNumber: number,
  values: Record<string, string>,
): { row: OutletSourceRow | null; errors: ImportIssue[] } {
  const errors: ImportIssue[] = [];
  let sourceId: string | null = null;
  try {
    sourceId = sourceIdentity(values.outlet_id ?? "");
  } catch {
    errors.push(issue(rowNumber, null, "outlet_id", "Source identifier is empty."));
  }
  const brandError = requireAllowedValue(
    OUTLET_DATASET,
    OUTLET_FILE,
    rowNumber,
    sourceId,
    "brand",
    values.brand ?? "",
    brands,
  );
  const depotError = requireAllowedValue(
    OUTLET_DATASET,
    OUTLET_FILE,
    rowNumber,
    sourceId,
    "depot",
    values.depot ?? "",
    depots,
  );
  const dockError = requireAllowedValue(
    OUTLET_DATASET,
    OUTLET_FILE,
    rowNumber,
    sourceId,
    "dock_type",
    values.dock_type ?? "",
    dockTypes,
  );
  const parkingError = requireAllowedValue(
    OUTLET_DATASET,
    OUTLET_FILE,
    rowNumber,
    sourceId,
    "parking_constraint",
    values.parking_constraint ?? "",
    parkingConstraints,
  );
  if ((values.district ?? "").trim() === "") {
    errors.push(issue(rowNumber, sourceId, "district", "District is empty."));
  }
  const openError = parseCallerTime(
    OUTLET_DATASET,
    OUTLET_FILE,
    rowNumber,
    sourceId,
    "window_open_time",
    values.window_open_time ?? "",
    "HH:MM",
  );
  const closeError = parseCallerTime(
    OUTLET_DATASET,
    OUTLET_FILE,
    rowNumber,
    sourceId,
    "window_close_time",
    values.window_close_time ?? "",
    "HH:MM",
  );
  const mallWindow = values.mall_window ?? "";
  const mallError =
    mallWindow === "" ||
    /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.test(mallWindow)
      ? null
      : issue(
          rowNumber,
          sourceId,
          "mall_window",
          "Value must be blank or HH:MM-HH:MM.",
        );
  for (const error of [brandError, depotError, dockError, parkingError, openError, closeError, mallError]) {
    if (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0 || sourceId === null || brandError || depotError || dockError || parkingError || openError || closeError) {
    return { row: null, errors };
  }
  const brand = values.brand as (typeof brands)[number];
  const depot = values.depot as (typeof depots)[number];
  const dockType = values.dock_type as (typeof dockTypes)[number];
  const parkingConstraint = values.parking_constraint as (typeof parkingConstraints)[number];
  return {
    row: {
      sourceId,
      values,
      brand,
      district: values.district ?? "",
      depot,
      dockType,
      parkingConstraint,
      mallWindow: mallWindow === "" ? null : mallWindow,
      windowOpenTime: clockTime(values.window_open_time ?? ""),
      windowCloseTime: clockTime(values.window_close_time ?? ""),
    },
    errors: [],
  };
}

function issue(
  row: number,
  sourceId: string | null,
  field: string,
  message: string,
): ImportIssue {
  return {
    dataset: OUTLET_DATASET,
    file: OUTLET_FILE,
    row,
    sourceId,
    field,
    message,
  };
}
