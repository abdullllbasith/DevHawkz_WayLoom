export type DependencyState = "ok" | "unavailable";

export type ReadinessReport = {
  status: "ready" | "not_ready";
  database: DependencyState;
};

export function readinessReport(database: DependencyState): ReadinessReport {
  return {
    status: database === "ok" ? "ready" : "not_ready",
    database,
  };
}

export async function probeDatabase(query: () => Promise<unknown>): Promise<DependencyState> {
  try {
    await query();
    return "ok";
  } catch {
    return "unavailable";
  }
}
