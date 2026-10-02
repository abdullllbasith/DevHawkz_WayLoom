import { access } from "node:fs/promises";
import path from "node:path";

import { type ImportIssue } from "./issues.js";

export const HACKATHON_DATASET_FILES = [
  "outlets.csv",
  "vehicles.csv",
  "calendar.csv",
] as const;

export type HackathonDatasetFile = (typeof HACKATHON_DATASET_FILES)[number];

const datasetNames: Record<HackathonDatasetFile, string> = {
  "outlets.csv": "outlets",
  "vehicles.csv": "vehicles",
  "calendar.csv": "calendar",
};

export function competitionImportDirectory(repoRoot: string): string {
  return path.join(repoRoot, "data", "competition-import");
}

export function isHackathonDatasetFile(
  fileName: string,
): fileName is HackathonDatasetFile {
  return HACKATHON_DATASET_FILES.some((file) => file === fileName);
}

export function datasetName(fileName: HackathonDatasetFile): string {
  return datasetNames[fileName];
}

export function rejectNonHackathonDataset(fileName: string): ImportIssue | null {
  if (isHackathonDatasetFile(fileName)) {
    return null;
  }
  return {
    dataset: "competition-import",
    file: fileName,
    row: null,
    sourceId: null,
    field: null,
    message:
      "This file is outside the Hackathon runtime import set. Datathon-only datasets are not imported.",
  };
}

export async function discoverHackathonDatasets(
  directory: string,
): Promise<{ present: HackathonDatasetFile[]; errors: ImportIssue[] }> {
  const present: HackathonDatasetFile[] = [];
  const errors: ImportIssue[] = [];
  for (const fileName of HACKATHON_DATASET_FILES) {
    try {
      await access(path.join(directory, fileName));
      present.push(fileName);
    } catch {
      errors.push({
        dataset: datasetName(fileName),
        file: fileName,
        row: null,
        sourceId: null,
        field: null,
        message: "Required competition file is missing.",
      });
    }
  }
  return { present, errors };
}
