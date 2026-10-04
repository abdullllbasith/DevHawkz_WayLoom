const localDatabases = ["wayloom_development", "wayloom_test"] as const;
const localHosts = ["127.0.0.1", "postgres"] as const;
const placeholderPasswords = ["PASSWORD", "build"] as const;

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
  const postgresql = url.protocol === "postgresql:" || url.protocol === "postgres:";
  if (!postgresql || database.length === 0) {
    throw new ImportTargetError("DATABASE_URL is not a valid database URL.");
  }

  const allowedLocal =
    url.hostname === "127.0.0.1" && localDatabases.some((name) => name === database);
  const allowedRemoteDevelopment =
    nodeEnv === "development" &&
    !localHosts.some((host) => host === url.hostname) &&
    database === "postgres" &&
    !isPlaceholderPassword(url.password);

  if (!allowedLocal && !allowedRemoteDevelopment) {
    throw new ImportTargetError(
      "Refusing competition import. The database target is not the local development or test database, or a development remote postgres database.",
    );
  }
  return { database };
}

function isPlaceholderPassword(password: string): boolean {
  return password.length === 0 || placeholderPasswords.some((placeholder) => placeholder === password);
}
