import { assertRuntimeDatabaseUrl } from "./runtime-database.js";
import { parseLoginRateLimit, type LoginRateLimitConfig } from "./security/login-rate-limit.js";

export type NodeEnvironment = "development" | "test" | "production";

export type LogLevel = "error" | "warn" | "info" | "debug";

export type ApiConfig = {
  nodeEnv: NodeEnvironment;
  host: string;
  port: number;
  logLevel: LogLevel;
  loginRateLimit: LoginRateLimitConfig;
};

const nodeEnvironments: readonly NodeEnvironment[] = [
  "development",
  "test",
  "production",
];

const logLevels: readonly LogLevel[] = ["error", "warn", "info", "debug"];

const defaultDevelopmentHost = "127.0.0.1";
const defaultDevelopmentPort = 4000;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const nodeEnv = parseNodeEnvironment(env.NODE_ENV);
  assertRuntimeDatabaseUrl(env.DATABASE_URL, nodeEnv);
  return {
    nodeEnv,
    host: parseHost(env.API_HOST, nodeEnv),
    port: parsePort(env.API_PORT, nodeEnv),
    logLevel: parseLogLevel(env.LOG_LEVEL),
    loginRateLimit: parseLoginRateLimit(env, nodeEnv),
  };
}

function parseNodeEnvironment(value: string | undefined): NodeEnvironment {
  if (isNodeEnvironment(value)) {
    return value;
  }
  throw new Error(
    "Invalid configuration: NODE_ENV must be development, test, or production.",
  );
}

function parseHost(
  value: string | undefined,
  nodeEnv: NodeEnvironment,
): string {
  if (value === undefined || value === "") {
    if (nodeEnv === "production") {
      throw new Error(
        "Invalid configuration: API_HOST is required when NODE_ENV is production.",
      );
    }
    return defaultDevelopmentHost;
  }
  if (value.trim() === "") {
    throw new Error("Invalid configuration: API_HOST must not be blank.");
  }
  return value;
}

function parsePort(
  value: string | undefined,
  nodeEnv: NodeEnvironment,
): number {
  if (value === undefined || value === "") {
    if (nodeEnv === "production") {
      throw new Error(
        "Invalid configuration: API_PORT is required when NODE_ENV is production.",
      );
    }
    return defaultDevelopmentPort;
  }
  if (!/^[0-9]+$/.test(value)) {
    throw new Error(
      "Invalid configuration: API_PORT must be an integer from 1 to 65535.",
    );
  }
  const port = Number(value);
  if (port < 1 || port > 65535) {
    throw new Error(
      "Invalid configuration: API_PORT must be an integer from 1 to 65535.",
    );
  }
  return port;
}

function parseLogLevel(value: string | undefined): LogLevel {
  if (value === undefined || value === "") {
    return "info";
  }
  if (isLogLevel(value)) {
    return value;
  }
  throw new Error(
    "Invalid configuration: LOG_LEVEL must be error, warn, info, or debug.",
  );
}

function isNodeEnvironment(
  value: string | undefined,
): value is NodeEnvironment {
  return nodeEnvironments.some((environment) => environment === value);
}

function isLogLevel(value: string): value is LogLevel {
  return logLevels.some((level) => level === value);
}
