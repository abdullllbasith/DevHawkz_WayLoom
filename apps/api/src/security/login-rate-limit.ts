import type { IncomingMessage } from "node:http";
import type { NodeEnvironment } from "../config.js";

export type LoginRateLimitConfig = {
  maxFailures: number;
  windowSeconds: number;
};

export type LoginRateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

const developmentDefaults: LoginRateLimitConfig = {
  maxFailures: 20,
  windowSeconds: 900,
};

export function parseLoginRateLimit(
  env: NodeJS.ProcessEnv,
  nodeEnv: NodeEnvironment,
): LoginRateLimitConfig {
  const maxRaw = env.LOGIN_RATE_LIMIT_MAX;
  const windowRaw = env.LOGIN_RATE_LIMIT_WINDOW_SECONDS;
  const omitted = (maxRaw === undefined || maxRaw === "") && (windowRaw === undefined || windowRaw === "");
  if (omitted) {
    if (nodeEnv === "production") {
      throw new Error(
        "Invalid configuration: LOGIN_RATE_LIMIT_MAX and LOGIN_RATE_LIMIT_WINDOW_SECONDS are required when NODE_ENV is production.",
      );
    }
    return developmentDefaults;
  }
  return {
    maxFailures: parsePositiveInteger(maxRaw, "LOGIN_RATE_LIMIT_MAX"),
    windowSeconds: parsePositiveInteger(windowRaw, "LOGIN_RATE_LIMIT_WINDOW_SECONDS"),
  };
}

export function clientAddress(request: IncomingMessage): string | null {
  const socketAddress = request.socket?.remoteAddress;
  if (socketAddress !== undefined && socketAddress.length > 0) {
    return normalizeAddress(socketAddress);
  }
  const forwarded = request.headers["x-forwarded-for"];
  const first =
    typeof forwarded === "string"
      ? forwarded.split(",")[0]?.trim()
      : Array.isArray(forwarded)
        ? forwarded[0]?.split(",")[0]?.trim()
        : undefined;
  if (first === undefined || first.length === 0) {
    return null;
  }
  return normalizeAddress(first);
}

function normalizeAddress(address: string): string {
  return address.startsWith("::ffff:") ? address.slice("::ffff:".length) : address;
}

export function createLoginRateLimiter(config: LoginRateLimitConfig) {
  const failures = new Map<string, number[]>();
  return {
    check(input: { loginIdentifier: string; remoteAddress: string | null; now: Date }): LoginRateLimitDecision {
      if (input.remoteAddress === null || input.remoteAddress.length === 0) {
        return { allowed: false, retryAfterSeconds: config.windowSeconds };
      }
      const recent = recentFailures(failures.get(key(input.loginIdentifier, input.remoteAddress)) ?? [], input.now, config);
      if (recent.length < config.maxFailures) {
        return { allowed: true };
      }
      const oldest = recent[0] ?? input.now.getTime();
      const retryAfterMs = oldest + config.windowSeconds * 1000 - input.now.getTime();
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
    },
    recordFailure(input: { loginIdentifier: string; remoteAddress: string; now: Date }): void {
      const bucketKey = key(input.loginIdentifier, input.remoteAddress);
      const recent = recentFailures(failures.get(bucketKey) ?? [], input.now, config);
      recent.push(input.now.getTime());
      failures.set(bucketKey, recent);
    },
  };
}

export type LoginRateLimiter = ReturnType<typeof createLoginRateLimiter>;

function key(loginIdentifier: string, remoteAddress: string): string {
  return `POST /api/auth/login\n${remoteAddress}\n${loginIdentifier}`;
}

function recentFailures(timestamps: readonly number[], now: Date, config: LoginRateLimitConfig): number[] {
  const earliest = now.getTime() - config.windowSeconds * 1000;
  return timestamps.filter((timestamp) => timestamp > earliest);
}

function parsePositiveInteger(value: string | undefined, name: string): number {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) {
    throw new Error(`Invalid configuration: ${name} must be a positive integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Invalid configuration: ${name} must be a positive integer.`);
  }
  return parsed;
}
