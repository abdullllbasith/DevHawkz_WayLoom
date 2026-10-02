import { parseCsv } from "./csv.js";
import { executeImport, type ImportSummary } from "./identity.js";
import { type ImportIssue } from "./issues.js";
import { requireHeaders } from "./validate.js";

export const SERVICE_ALLOWANCE_FILE = "service_allowance.csv";
export const SERVICE_ALLOWANCE_DATASET = "service-allowance";

const serviceAllowanceHeaders = ["brand", "dock_type", "service_allowance_min"] as const;

export type ServiceAllowanceSourceRow = {
  sourceId: string;
  values: Record<string, string>;
  brand: string;
  dockType: string;
  serviceAllowanceMin: string;
};

export function validateServiceAllowanceCsv(text: string): {
  rows: ServiceAllowanceSourceRow[];
  errors: ImportIssue[];
} {
  const parsed = parseCsv(SERVICE_ALLOWANCE_DATASET, SERVICE_ALLOWANCE_FILE, text);
  if (parsed.errors.length > 0 || parsed.table === null) {
    return { rows: [], errors: parsed.errors };
  }
  const headerErrors = requireHeaders(
    SERVICE_ALLOWANCE_DATASET,
    SERVICE_ALLOWANCE_FILE,
    parsed.table,
    serviceAllowanceHeaders,
  );
  const unexpected = parsed.table.headers.filter(
    (header) => !serviceAllowanceHeaders.some((expected) => expected === header),
  );
  const unexpectedErrors = unexpected.map((header) => ({
    dataset: SERVICE_ALLOWANCE_DATASET,
    file: SERVICE_ALLOWANCE_FILE,
    row: 1,
    sourceId: null,
    field: header,
    message: "Column is not a supplied service-allowance source field.",
  }));
  const orderError =
    parsed.table.headers.join(",") === serviceAllowanceHeaders.join(",")
      ? []
      : [
          {
            dataset: SERVICE_ALLOWANCE_DATASET,
            file: SERVICE_ALLOWANCE_FILE,
            row: 1,
            sourceId: null,
            field: null,
            message: "Service-allowance columns are not in the supplied source order.",
          },
        ];
  if (headerErrors.length > 0 || unexpectedErrors.length > 0 || orderError.length > 0) {
    return {
      rows: [],
      errors: [...headerErrors, ...unexpectedErrors, ...orderError],
    };
  }

  const rows: ServiceAllowanceSourceRow[] = [];
  const errors: ImportIssue[] = [];
  const seen = new Map<string, number>();
  for (const row of parsed.table.rows) {
    const mapped = mapServiceAllowanceRow(row.rowNumber, row.values);
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
          `Duplicate source identity (brand, dock_type). The first row is ${String(previous)}.`,
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

export async function importValidatedServiceAllowance(input: {
  rows: ServiceAllowanceSourceRow[];
  loadExisting: (sourceId: string) => Promise<Record<string, string> | null>;
  write: (row: ServiceAllowanceSourceRow) => Promise<void>;
  transaction?: (work: () => Promise<void>) => Promise<void>;
}): Promise<ImportSummary> {
  const bySourceId = new Map(input.rows.map((row) => [row.sourceId, row]));
  return executeImport({
    dataset: SERVICE_ALLOWANCE_DATASET,
    file: SERVICE_ALLOWANCE_FILE,
    records: input.rows.map((row) => ({ sourceId: row.sourceId, values: row.values })),
    loadExisting: input.loadExisting,
    write: async (record) => {
      const row = bySourceId.get(record.sourceId);
      if (!row) {
        throw new Error("Service-allowance source row is missing.");
      }
      await input.write(row);
    },
    transaction: input.transaction,
  });
}

export function serviceAllowanceSourceId(brand: string, dockType: string): string {
  return JSON.stringify([brand, dockType]);
}

export function parseServiceAllowanceSourceId(sourceId: string): { brand: string; dockType: string } {
  const parsed: unknown = JSON.parse(sourceId);
  if (!Array.isArray(parsed) || parsed.length !== 2) {
    throw new Error("Service-allowance source identity is invalid.");
  }
  const [brand, dockType] = parsed;
  if (typeof brand !== "string" || typeof dockType !== "string") {
    throw new Error("Service-allowance source identity is invalid.");
  }
  return { brand, dockType };
}

function mapServiceAllowanceRow(
  rowNumber: number,
  values: Record<string, string>,
): { row: ServiceAllowanceSourceRow | null; errors: ImportIssue[] } {
  const errors: ImportIssue[] = [];
  const brand = values.brand ?? "";
  const dockType = values.dock_type ?? "";
  if (brand.length === 0) {
    errors.push(issue(rowNumber, null, "brand", "Source identity brand is empty."));
  }
  if (dockType.length === 0) {
    errors.push(issue(rowNumber, null, "dock_type", "Source identity dock_type is empty."));
  }
  if (errors.length > 0) {
    return { row: null, errors };
  }
  return {
    row: {
      sourceId: serviceAllowanceSourceId(brand, dockType),
      values,
      brand,
      dockType,
      serviceAllowanceMin: values.service_allowance_min ?? "",
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
    dataset: SERVICE_ALLOWANCE_DATASET,
    file: SERVICE_ALLOWANCE_FILE,
    row,
    sourceId,
    field,
    message,
  };
}
