import { type ImportIssue } from "./issues.js";

export type CsvRow = {
  rowNumber: number;
  values: Record<string, string>;
};

export type CsvTable = {
  headers: string[];
  rows: CsvRow[];
};

export function parseCsv(
  dataset: string,
  file: string,
  text: string,
): { table: CsvTable | null; errors: ImportIssue[] } {
  const records = splitRecords(text);
  if (records.length === 0 || records.every((record) => record.trim() === "")) {
    return {
      table: null,
      errors: [
        {
          dataset,
          file,
          row: null,
          sourceId: null,
          field: null,
          message: "CSV file is empty.",
        },
      ],
    };
  }

  const headerCells = parseRecord(records[0] ?? "");
  const errors: ImportIssue[] = [];
  const seen = new Set<string>();
  for (const header of headerCells) {
    if (header.trim() === "") {
      errors.push({
        dataset,
        file,
        row: 1,
        sourceId: null,
        field: null,
        message: "CSV header contains an empty column name.",
      });
      continue;
    }
    if (seen.has(header)) {
      errors.push({
        dataset,
        file,
        row: 1,
        sourceId: null,
        field: header,
        message: "CSV header contains a duplicate column name.",
      });
    }
    seen.add(header);
  }
  if (errors.length > 0) {
    return { table: null, errors };
  }

  const rows: CsvRow[] = [];
  for (let index = 1; index < records.length; index += 1) {
    const record = records[index] ?? "";
    if (record.trim() === "") {
      continue;
    }
    const cells = parseRecord(record);
    const rowNumber = index + 1;
    if (cells.length !== headerCells.length) {
      errors.push({
        dataset,
        file,
        row: rowNumber,
        sourceId: null,
        field: null,
        message: `Expected ${String(headerCells.length)} columns and found ${String(cells.length)}.`,
      });
      continue;
    }
    const values: Record<string, string> = {};
    for (let cellIndex = 0; cellIndex < headerCells.length; cellIndex += 1) {
      const header = headerCells[cellIndex] ?? "";
      values[header] = cells[cellIndex] ?? "";
    }
    rows.push({ rowNumber, values });
  }

  return {
    table: errors.length === 0 ? { headers: headerCells, rows } : null,
    errors,
  };
}

function splitRecords(text: string): string[] {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const records: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index] ?? "";
    if (character === "\"") {
      const next = normalized[index + 1];
      if (quoted && next === "\"") {
        current += "\"";
        index += 1;
        continue;
      }
      quoted = !quoted;
      current += character;
      continue;
    }
    if (character === "\n" && !quoted) {
      records.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  if (current.length > 0) {
    records.push(current);
  }
  return records;
}

function parseRecord(record: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < record.length; index += 1) {
    const character = record[index] ?? "";
    if (character === "\"") {
      if (quoted && record[index + 1] === "\"") {
        current += "\"";
        index += 1;
        continue;
      }
      quoted = !quoted;
      continue;
    }
    if (character === "," && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  cells.push(current);
  return cells;
}
