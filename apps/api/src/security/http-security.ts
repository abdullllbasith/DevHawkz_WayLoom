import type { IncomingMessage, ServerResponse } from "node:http";
import type { NodeEnvironment } from "../config.js";

export const developmentBrowserOrigin = "http://127.0.0.1:3000";

const corsMethods = ["GET", "POST"] as const;
const corsRequestHeaders = ["content-type", "x-wayloom-csrf"] as const;
const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

export type HttpSecurityConfig = {
  browserOrigin: string | null;
  httpsEnabled: boolean;
};

export function parseBrowserOrigin(
  value: string | undefined,
  nodeEnv: NodeEnvironment,
): string | null {
  const configured = value?.trim() ?? "";
  if (configured === "") {
    return nodeEnv === "production" ? null : developmentBrowserOrigin;
  }
  rejectUnsafeOriginToken(configured);
  if (nodeEnv === "production") {
    return requireHttpsOrigin(configured, "production WEB_ORIGIN must be the https origin of the deployed frontend.");
  }
  const origin = requireHttpLoopbackOrigin(configured);
  if (origin === null) {
    throw new Error(
      "Invalid configuration: development and test WEB_ORIGIN must be an http://127.0.0.1 origin.",
    );
  }
  return origin;
}

export function parseHttpsEnabled(
  value: string | undefined,
  nodeEnv: NodeEnvironment,
): boolean {
  if (value === undefined || value.trim() === "") {
    return false;
  }
  if (value === "true") {
    if (nodeEnv !== "production") {
      throw new Error(
        "Invalid configuration: WEB_HTTPS can be true only when NODE_ENV is production.",
      );
    }
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error("Invalid configuration: WEB_HTTPS must be true or false.");
}

export function securityHeaders(input: {
  nodeEnv: NodeEnvironment;
  httpsEnabled: boolean;
  pathname: string;
}): Record<string, string> {
  const headers: Record<string, string> = {
    "x-content-type-options": "nosniff",
    "referrer-policy": "same-origin",
    "x-frame-options": "DENY",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  };
  if (input.pathname !== "/health") {
    headers["cache-control"] = "no-store";
  }
  if (input.nodeEnv === "production" && input.httpsEnabled) {
    headers["strict-transport-security"] = "max-age=31536000";
  }
  return headers;
}

export function applySecurityHeaders(
  response: ServerResponse,
  headers: Record<string, string>,
): void {
  for (const [name, value] of Object.entries(headers)) {
    response.setHeader(name, value);
  }
}

export function corsResponseHeaders(
  request: IncomingMessage,
  browserOrigin: string | null,
): Record<string, string> | null {
  const origin = headerValue(request.headers.origin);
  if (browserOrigin === null || origin !== browserOrigin) {
    return null;
  }
  const method = (request.method ?? "GET").toUpperCase();
  if (method === "OPTIONS") {
    const requestedMethod = headerValue(request.headers["access-control-request-method"])?.toUpperCase();
    if (!corsMethods.some((allowed) => allowed === requestedMethod) || !requestedHeadersAllowed(request)) {
      return null;
    }
    return {
      ...allowOrigin(browserOrigin),
      "access-control-allow-methods": corsMethods.join(", "),
      "access-control-allow-headers": corsRequestHeaders.join(", "),
      "access-control-max-age": "600",
    };
  }
  if (!corsMethods.some((allowed) => allowed === method)) {
    return null;
  }
  return allowOrigin(browserOrigin);
}

function allowOrigin(origin: string): Record<string, string> {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    vary: "Origin",
  };
}

function requestedHeadersAllowed(request: IncomingMessage): boolean {
  const requested = headerValue(request.headers["access-control-request-headers"]);
  if (requested === undefined || requested.trim() === "") {
    return true;
  }
  const names = requested.split(",").map((name) => name.trim().toLowerCase()).filter((name) => name.length > 0);
  return names.every((name) => corsRequestHeaders.some((allowed) => allowed === name));
}

function rejectUnsafeOriginToken(value: string): void {
  if (value === "*" || value.toLowerCase() === "null" || value.includes("*")) {
    throw new Error("Invalid configuration: WEB_ORIGIN must be one explicit origin.");
  }
}

function requireHttpsOrigin(value: string, message: string): string {
  const url = parseOriginUrl(value);
  const hostname = url?.hostname.toLowerCase() ?? "";
  const local = localHosts.has(hostname) || hostname.endsWith(".localhost");
  if (url === null || url.protocol !== "https:" || local) {
    throw new Error(`Invalid configuration: ${message}`);
  }
  return url.origin;
}

function requireHttpLoopbackOrigin(value: string): string | null {
  const url = parseOriginUrl(value);
  if (url === null || url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.port === "") {
    return null;
  }
  return url.origin;
}

function parseOriginUrl(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.origin !== value || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
    return null;
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    return null;
  }
  return url;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}
