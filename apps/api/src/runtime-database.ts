import type { NodeEnvironment } from "./config.js";

const localHosts = ["127.0.0.1", "postgres"] as const;
const placeholderPasswords = ["PASSWORD", "build"] as const;

export function assertRuntimeDatabaseUrl(
  connectionString: string | undefined,
  nodeEnv: NodeEnvironment,
): void {
  if (connectionString === undefined || connectionString.trim() === "") {
    throw new Error(`Invalid configuration: DATABASE_URL is required when NODE_ENV is ${nodeEnv}.`);
  }
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("Invalid configuration: DATABASE_URL must be a PostgreSQL URL.");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const postgresql = url.protocol === "postgresql:" || url.protocol === "postgres:";
  if (!postgresql || database.length === 0) {
    throw new Error("Invalid configuration: DATABASE_URL must be a PostgreSQL URL.");
  }
  if (nodeEnv === "production") {
    if (database === "wayloom_development" || database === "wayloom_test" || isPlaceholderPassword(url.password)) {
      throw new Error(
        "Invalid configuration: production DATABASE_URL must not use the development database, the test database, or a placeholder password.",
      );
    }
    return;
  }
  if (nodeEnv === "test") {
    if (url.hostname !== "127.0.0.1" || database !== "wayloom_test") {
      throw new Error("Invalid configuration: test DATABASE_URL must use the local wayloom_test database.");
    }
    return;
  }
  const localDevelopment = localHosts.some((host) => host === url.hostname) && database === "wayloom_development";
  const remoteDevelopment = !localHosts.some((host) => host === url.hostname) && database === "postgres" && !isPlaceholderPassword(url.password);
  if (!localDevelopment && !remoteDevelopment) {
    throw new Error("Invalid configuration: development DATABASE_URL must use the local wayloom_development database or a remote postgres database.");
  }
}

function isPlaceholderPassword(password: string): boolean {
  return password.length === 0 || placeholderPasswords.some((placeholder) => placeholder === password);
}
