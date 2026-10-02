export type ImportIssue = {
  dataset: string;
  file: string;
  row: number | null;
  sourceId: string | null;
  field: string | null;
  message: string;
};

export function formatImportIssue(issue: ImportIssue): string {
  const row = issue.row === null ? "-" : String(issue.row);
  const sourceId = issue.sourceId === null ? "-" : issue.sourceId;
  const field = issue.field === null ? "-" : issue.field;
  return `${issue.dataset} ${issue.file} row ${row} source ${sourceId} field ${field}: ${issue.message}`;
}
