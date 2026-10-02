import { parseCsv } from "./csv.js";
import { executeImport, type ImportSummary, type SourceRecord } from "./identity.js";
import { type ImportIssue } from "./issues.js";
import {
  duplicateSourceIdentifiers,
  requireAllowedValue,
  requireHeaders,
} from "./validate.js";

export const CALENDAR_FILE = "calendar.csv";
export const CALENDAR_DATASET = "calendar";

const calendarHeaders = [
  "date",
  "dow",
  "dow_name",
  "is_weekend",
  "iso_year",
  "iso_week",
  "is_payday",
  "festival",
  "festival_ramp",
  "is_holiday",
  "monsoon",
  "is_operating",
] as const;

const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const flags = ["0", "1"] as const;

export type CalendarSourceRow = {
  sourceId: string;
  values: Record<string, string>;
  sourceDate: Date;
  dow: number;
  dowName: (typeof dayNames)[number];
  isWeekend: number;
  isoYear: number;
  isoWeek: number;
  isPayday: number;
  festival: string;
  festivalRamp: string;
  isHoliday: number;
  monsoon: number;
  isOperating: number;
};

export function validateCalendarCsv(text: string): {
  rows: CalendarSourceRow[];
  errors: ImportIssue[];
} {
  const parsed = parseCsv(CALENDAR_DATASET, CALENDAR_FILE, text);
  if (parsed.errors.length > 0 || parsed.table === null) {
    return { rows: [], errors: parsed.errors };
  }
  const headerErrors = requireHeaders(
    CALENDAR_DATASET,
    CALENDAR_FILE,
    parsed.table,
    calendarHeaders,
  );
  const unexpected = parsed.table.headers.filter(
    (header) => !calendarHeaders.some((expected) => expected === header),
  );
  const unexpectedErrors = unexpected.map((header) => ({
    dataset: CALENDAR_DATASET,
    file: CALENDAR_FILE,
    row: 1,
    sourceId: null,
    field: header,
    message: "Column is not a supplied calendar source field.",
  }));
  const orderError =
    parsed.table.headers.join(",") === calendarHeaders.join(",")
      ? []
      : [
          {
            dataset: CALENDAR_DATASET,
            file: CALENDAR_FILE,
            row: 1,
            sourceId: null,
            field: null,
            message: "Calendar columns are not in the supplied source order.",
          },
        ];
  if (headerErrors.length > 0 || unexpectedErrors.length > 0 || orderError.length > 0) {
    return {
      rows: [],
      errors: [...headerErrors, ...unexpectedErrors, ...orderError],
    };
  }

  const duplicateErrors = duplicateSourceIdentifiers(
    CALENDAR_DATASET,
    CALENDAR_FILE,
    parsed.table,
    "date",
  );
  const rows: CalendarSourceRow[] = [];
  const errors = [...duplicateErrors];
  for (const row of parsed.table.rows) {
    const mapped = mapCalendarRow(row.rowNumber, row.values);
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

export async function importValidatedCalendar(input: {
  rows: CalendarSourceRow[];
  loadExisting: (sourceId: string) => Promise<Record<string, string> | null>;
  write: (row: CalendarSourceRow) => Promise<void>;
  transaction?: (work: () => Promise<void>) => Promise<void>;
}): Promise<ImportSummary> {
  const bySourceId = new Map(input.rows.map((row) => [row.sourceId, row]));
  return executeImport({
    dataset: CALENDAR_DATASET,
    file: CALENDAR_FILE,
    records: input.rows.map(sourceRecord),
    loadExisting: input.loadExisting,
    write: async (record) => {
      const row = bySourceId.get(record.sourceId);
      if (!row) {
        throw new Error("Calendar source row is missing.");
      }
      await input.write(row);
    },
    transaction: input.transaction,
  });
}

export function formatSourceDate(value: Date): string {
  const year = String(value.getUTCFullYear()).padStart(4, "0");
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sourceRecord(row: CalendarSourceRow): SourceRecord {
  return { sourceId: row.sourceId, values: row.values };
}

function mapCalendarRow(
  rowNumber: number,
  values: Record<string, string>,
): { row: CalendarSourceRow | null; errors: ImportIssue[] } {
  const errors: ImportIssue[] = [];
  const sourceDate = parseSourceDate(rowNumber, values.date ?? "");
  if (sourceDate.error) {
    errors.push(sourceDate.error);
  }
  const sourceId = sourceDate.iso;
  const dowError = requireAllowedValue(
    CALENDAR_DATASET,
    CALENDAR_FILE,
    rowNumber,
    sourceId,
    "dow",
    values.dow ?? "",
    ["0", "1", "2", "3", "4", "5", "6"],
  );
  const dowNameError = requireAllowedValue(
    CALENDAR_DATASET,
    CALENDAR_FILE,
    rowNumber,
    sourceId,
    "dow_name",
    values.dow_name ?? "",
    dayNames,
  );
  const weekendError = flagError(rowNumber, sourceId, "is_weekend", values.is_weekend ?? "");
  const paydayError = flagError(rowNumber, sourceId, "is_payday", values.is_payday ?? "");
  const holidayError = flagError(rowNumber, sourceId, "is_holiday", values.is_holiday ?? "");
  const monsoonError = flagError(rowNumber, sourceId, "monsoon", values.monsoon ?? "");
  const operatingError = flagError(rowNumber, sourceId, "is_operating", values.is_operating ?? "");
  const festival = values.festival ?? "";
  const rampError = decimalSourceValue(
    rowNumber,
    sourceId,
    "festival_ramp",
    values.festival_ramp ?? "",
  );
  const isoYearError = integerToken(rowNumber, sourceId, "iso_year", values.iso_year ?? "");
  const isoWeekError = integerToken(rowNumber, sourceId, "iso_week", values.iso_week ?? "");
  for (const error of [
    dowError,
    dowNameError,
    weekendError,
    paydayError,
    holidayError,
    monsoonError,
    operatingError,
    rampError,
    isoYearError,
    isoWeekError,
  ]) {
    if (error) {
      errors.push(error);
    }
  }
  if (
    sourceDate.date === null ||
    sourceId === null ||
    dowError ||
    dowNameError ||
    weekendError ||
    paydayError ||
    holidayError ||
    monsoonError ||
    operatingError ||
    rampError ||
    isoYearError ||
    isoWeekError
  ) {
    return { row: null, errors };
  }

  const dow = Number(values.dow);
  const dowName = values.dow_name as (typeof dayNames)[number];
  if (dowName !== dayNames[dow]) {
    errors.push(
      issue(rowNumber, sourceId, "dow_name", "Day name does not match the supplied day number."),
    );
  }
  const expectedWeekend = dow === 6 ? "1" : "0";
  if (values.is_weekend !== expectedWeekend) {
    errors.push(
      issue(
        rowNumber,
        sourceId,
        "is_weekend",
        "Weekend flag does not match the supplied day number.",
      ),
    );
  }
  const iso = isoYearAndWeek(sourceDate.date);
  if (values.iso_year !== String(iso.year)) {
    errors.push(
      issue(rowNumber, sourceId, "iso_year", "ISO year does not match the source date."),
    );
  }
  if (values.iso_week !== String(iso.week)) {
    errors.push(
      issue(rowNumber, sourceId, "iso_week", "ISO week does not match the source date."),
    );
  }
  const weekday = sourceDate.date.getUTCDay();
  const mondayBased = weekday === 0 ? 6 : weekday - 1;
  if (dow !== mondayBased) {
    errors.push(issue(rowNumber, sourceId, "dow", "Day number does not match the source date."));
  }
  if (errors.length > 0) {
    return { row: null, errors };
  }

  return {
    row: {
      sourceId,
      values,
      sourceDate: sourceDate.date,
      dow,
      dowName,
      isWeekend: Number(values.is_weekend),
      isoYear: Number(values.iso_year),
      isoWeek: Number(values.iso_week),
      isPayday: Number(values.is_payday),
      festival,
      festivalRamp: values.festival_ramp ?? "",
      isHoliday: Number(values.is_holiday),
      monsoon: Number(values.monsoon),
      isOperating: Number(values.is_operating),
    },
    errors: [],
  };
}

function parseSourceDate(
  rowNumber: number,
  raw: string,
): { iso: string | null; date: Date | null; error: ImportIssue | null } {
  if (!/^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(raw)) {
    return {
      iso: null,
      date: null,
      error: issue(rowNumber, null, "date", "Value must match YYYY-MM-DD."),
    };
  }
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(5, 7));
  const day = Number(raw.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return {
      iso: null,
      date: null,
      error: issue(rowNumber, raw, "date", "Value is not a real calendar date."),
    };
  }
  return { iso: raw, date, error: null };
}

function flagError(
  rowNumber: number,
  sourceId: string | null,
  field: string,
  raw: string,
): ImportIssue | null {
  return requireAllowedValue(
    CALENDAR_DATASET,
    CALENDAR_FILE,
    rowNumber,
    sourceId,
    field,
    raw,
    flags,
  );
}

function decimalSourceValue(
  rowNumber: number,
  sourceId: string | null,
  field: string,
  raw: string,
): ImportIssue | null {
  if (/^(?:0|[1-9]\d*)\.\d+$/.test(raw)) {
    return null;
  }
  return issue(rowNumber, sourceId, field, "Value must be a decimal source value.");
}

function integerToken(
  rowNumber: number,
  sourceId: string | null,
  field: string,
  raw: string,
): ImportIssue | null {
  if (/^(0|[1-9][0-9]*)$/.test(raw)) {
    return null;
  }
  return issue(rowNumber, sourceId, field, "Value must be the supplied whole number.");
}

function isoYearAndWeek(date: Date): { year: number; week: number } {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: utc.getUTCFullYear(), week };
}

function issue(
  row: number,
  sourceId: string | null,
  field: string,
  message: string,
): ImportIssue {
  return {
    dataset: CALENDAR_DATASET,
    file: CALENDAR_FILE,
    row,
    sourceId,
    field,
    message,
  };
}
