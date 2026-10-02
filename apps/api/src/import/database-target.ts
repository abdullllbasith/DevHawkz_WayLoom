const localDatabases = ["wayloom_development", "wayloom_test"] as const;

export class ImportTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportTargetError";
  }
}

export function assertImportDatabaseTarget(
  connectionString: string | undefined,
  nodeEnv: string | undefined,
): { database: string } {
  if (nodeEnv === "production") {
    throw new ImportTargetError(
      "Refusing competition import while NODE_ENV is production.",
    );
  }
  if (connectionString === undefined || connectionString.trim() === "") {
    throw new ImportTargetError("DATABASE_URL is required.");
  }
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new ImportTargetError("DATABASE_URL is not a valid database URL.");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const allowedDatabase = localDatabases.some((name) => name === database);
  if (
    (url.protocol !== "postgresql:" && url.protocol !== "postgres:") ||
    url.hostname !== "127.0.0.1" ||
    !allowedDatabase
  ) {
    throw new ImportTargetError(
      "Refusing competition import. The database target is not the local development or test database.",
    );
  }
  return { database };
}
