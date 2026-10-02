import { parseCsv } from "./csv.js";
import { executeImport, type ImportSummary, type SourceRecord } from "./identity.js";
import { type ImportIssue } from "./issues.js";
import {
  duplicateSourceIdentifiers,
  requireAllowedValue,
  requireHeaders,
  sourceIdentity,
} from "./validate.js";

export const VEHICLE_FILE = "vehicles.csv";
export const VEHICLE_DATASET = "vehicles";

const vehicleHeaders = [
  "vehicle_id",
  "type",
  "temp",
  "weight_cap_kg",
  "volume_cap_m3",
  "fuel_type",
  "km_per_l",
  "weekly_fuel_quota_l",
  "depot",
] as const;

const vehicleTypes = ["truck", "van"] as const;
const temperatures = ["reefer", "ambient"] as const;
const depots = ["Peliyagoda", "Kandy"] as const;

export type VehicleSourceRow = {
  sourceId: string;
  values: Record<string, string>;
  type: (typeof vehicleTypes)[number];
  temp: (typeof temperatures)[number];
  weightCapKg: string;
  volumeCapM3: string;
  fuelType: string;
  kmPerL: string;
  weeklyFuelQuotaL: string;
  depot: (typeof depots)[number];
};

export function validateVehicleCsv(text: string): {
  rows: VehicleSourceRow[];
  errors: ImportIssue[];
} {
  const parsed = parseCsv(VEHICLE_DATASET, VEHICLE_FILE, text);
  if (parsed.errors.length > 0 || parsed.table === null) {
    return { rows: [], errors: parsed.errors };
  }
  const headerErrors = requireHeaders(
    VEHICLE_DATASET,
    VEHICLE_FILE,
    parsed.table,
    vehicleHeaders,
  );
  const unexpected = parsed.table.headers.filter(
    (header) => !vehicleHeaders.some((expected) => expected === header),
  );
  const unexpectedErrors = unexpected.map((header) => ({
    dataset: VEHICLE_DATASET,
    file: VEHICLE_FILE,
    row: 1,
    sourceId: null,
    field: header,
    message: "Column is not an approved vehicle source field.",
  }));
  const orderError =
    parsed.table.headers.join(",") === vehicleHeaders.join(",")
      ? []
      : [
          {
            dataset: VEHICLE_DATASET,
            file: VEHICLE_FILE,
            row: 1,
            sourceId: null,
            field: null,
            message: "Vehicle columns are not in the supplied source order.",
          },
        ];
  if (headerErrors.length > 0 || unexpectedErrors.length > 0 || orderError.length > 0) {
    return {
      rows: [],
      errors: [...headerErrors, ...unexpectedErrors, ...orderError],
    };
  }

  const duplicateErrors = duplicateSourceIdentifiers(
    VEHICLE_DATASET,
    VEHICLE_FILE,
    parsed.table,
    "vehicle_id",
  );
  const rows: VehicleSourceRow[] = [];
  const errors = [...duplicateErrors];
  for (const row of parsed.table.rows) {
    const mapped = mapVehicleRow(row.rowNumber, row.values);
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

export async function importValidatedVehicles(input: {
  rows: VehicleSourceRow[];
  loadExisting: (sourceId: string) => Promise<Record<string, string> | null>;
  write: (row: VehicleSourceRow) => Promise<void>;
  transaction?: (work: () => Promise<void>) => Promise<void>;
}): Promise<ImportSummary> {
  const bySourceId = new Map(input.rows.map((row) => [row.sourceId, row]));
  return executeImport({
    dataset: VEHICLE_DATASET,
    file: VEHICLE_FILE,
    records: input.rows.map(sourceRecord),
    loadExisting: input.loadExisting,
    write: async (record) => {
      const row = bySourceId.get(record.sourceId);
      if (!row) {
        throw new Error("Vehicle source row is missing.");
      }
      await input.write(row);
    },
    transaction: input.transaction,
  });
}

export function canonicalDecimal(raw: string): string | null {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return null;
  }
  const [whole, fraction = ""] = trimmed.split(".");
  const wholeTrimmed = whole.replace(/^0+(?=\d)/, "");
  const fractionTrimmed = fraction.replace(/0+$/, "");
  if (fractionTrimmed.length === 0) {
    return wholeTrimmed;
  }
  return `${wholeTrimmed}.${fractionTrimmed}`;
}

function sourceRecord(row: VehicleSourceRow): SourceRecord {
  return { sourceId: row.sourceId, values: row.values };
}

function mapVehicleRow(
  rowNumber: number,
  values: Record<string, string>,
): { row: VehicleSourceRow | null; errors: ImportIssue[] } {
  const errors: ImportIssue[] = [];
  let sourceId: string | null = null;
  try {
    sourceId = sourceIdentity(values.vehicle_id ?? "");
  } catch {
    errors.push(issue(rowNumber, null, "vehicle_id", "Source identifier is empty."));
  }
  const typeError = requireAllowedValue(
    VEHICLE_DATASET,
    VEHICLE_FILE,
    rowNumber,
    sourceId,
    "type",
    values.type ?? "",
    vehicleTypes,
  );
  const tempError = requireAllowedValue(
    VEHICLE_DATASET,
    VEHICLE_FILE,
    rowNumber,
    sourceId,
    "temp",
    values.temp ?? "",
    temperatures,
  );
  const depotError = requireAllowedValue(
    VEHICLE_DATASET,
    VEHICLE_FILE,
    rowNumber,
    sourceId,
    "depot",
    values.depot ?? "",
    depots,
  );
  const weight = positiveDecimal(rowNumber, sourceId, "weight_cap_kg", values.weight_cap_kg ?? "");
  const volume = positiveDecimal(rowNumber, sourceId, "volume_cap_m3", values.volume_cap_m3 ?? "");
  const kmPerL = suppliedDecimal(rowNumber, sourceId, "km_per_l", values.km_per_l ?? "");
  const quota = suppliedDecimal(
    rowNumber,
    sourceId,
    "weekly_fuel_quota_l",
    values.weekly_fuel_quota_l ?? "",
  );
  const fuelType = values.fuel_type ?? "";
  if (fuelType.trim() === "") {
    errors.push(issue(rowNumber, sourceId, "fuel_type", "Fuel type is empty."));
  }
  for (const error of [typeError, tempError, depotError, weight.error, volume.error, kmPerL.error, quota.error]) {
    if (error) {
      errors.push(error);
    }
  }
  if (
    errors.length > 0 ||
    sourceId === null ||
    typeError ||
    tempError ||
    depotError ||
    weight.value === null ||
    volume.value === null ||
    kmPerL.value === null ||
    quota.value === null
  ) {
    return { row: null, errors };
  }
  return {
    row: {
      sourceId,
      values: {
        ...values,
        weight_cap_kg: weight.value,
        volume_cap_m3: volume.value,
        km_per_l: kmPerL.value,
        weekly_fuel_quota_l: quota.value,
      },
      type: values.type as (typeof vehicleTypes)[number],
      temp: values.temp as (typeof temperatures)[number],
      weightCapKg: values.weight_cap_kg ?? "",
      volumeCapM3: values.volume_cap_m3 ?? "",
      fuelType,
      kmPerL: values.km_per_l ?? "",
      weeklyFuelQuotaL: values.weekly_fuel_quota_l ?? "",
      depot: values.depot as (typeof depots)[number],
    },
    errors: [],
  };
}

function positiveDecimal(
  rowNumber: number,
  sourceId: string | null,
  field: string,
  raw: string,
): { value: string | null; error: ImportIssue | null } {
  const value = canonicalDecimal(raw);
  if (value === null || Number(value) <= 0) {
    return {
      value: null,
      error: issue(rowNumber, sourceId, field, "Capacity must be greater than 0."),
    };
  }
  return { value, error: null };
}

function suppliedDecimal(
  rowNumber: number,
  sourceId: string | null,
  field: string,
  raw: string,
): { value: string | null; error: ImportIssue | null } {
  const value = canonicalDecimal(raw);
  if (value === null) {
    return {
      value: null,
      error: issue(rowNumber, sourceId, field, "Value must be a supplied decimal number."),
    };
  }
  return { value, error: null };
}

function issue(
  row: number,
  sourceId: string | null,
  field: string,
  message: string,
): ImportIssue {
  return {
    dataset: VEHICLE_DATASET,
    file: VEHICLE_FILE,
    row,
    sourceId,
    field,
    message,
  };
}
