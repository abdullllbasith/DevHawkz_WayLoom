const developmentApiOrigin = "http://127.0.0.1:4000";
const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

export function contentSecurityPolicy(input: {
  nonce: string;
  nodeEnv: string | undefined;
  apiOrigin: string | undefined;
  httpsEnabled: boolean;
}): string {
  const development = input.nodeEnv === "development" || input.nodeEnv === "test";
  const script = development
    ? `script-src 'self' 'nonce-${input.nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `script-src 'self' 'nonce-${input.nonce}' 'strict-dynamic'`;
  const connectOrigin = resolveApiOrigin(input.apiOrigin, input.nodeEnv);
  const connect = connectOrigin === null ? "connect-src 'self'" : `connect-src 'self' ${connectOrigin}`;
  const upgrade = input.httpsEnabled ? " upgrade-insecure-requests;" : "";
  return [
    "default-src 'self'",
    script,
    `style-src 'self' 'nonce-${input.nonce}'`,
    "img-src 'self'",
    "font-src 'self'",
    connect,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ") + ";" + upgrade;
}

export function resolveApiOrigin(
  value: string | undefined,
  nodeEnv: string | undefined,
): string | null {
  const development = nodeEnv === "development" || nodeEnv === "test";
  const configured = value?.trim() ?? "";
  if (configured === "") {
    return development ? developmentApiOrigin : null;
  }
  value = configured;
  if (value === "*" || value.toLowerCase() === "null" || value.includes("*")) {
    throw new Error("Invalid configuration: API_ORIGIN must be one explicit origin.");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid configuration: API_ORIGIN must be an origin.");
  }
  if (url.origin !== value || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
    throw new Error("Invalid configuration: API_ORIGIN must be an origin.");
  }
  const hostname = url.hostname.toLowerCase();
  const local = localHosts.has(hostname) || hostname.endsWith(".localhost");
  if (development) {
    if (url.protocol !== "http:" || hostname !== "127.0.0.1" || url.port === "") {
      throw new Error(
        "Invalid configuration: development and test API_ORIGIN must be an http://127.0.0.1 origin.",
      );
    }
    return url.origin;
  }
  if (url.protocol !== "https:" || local) {
    throw new Error("Invalid configuration: production API_ORIGIN must be an https origin.");
  }
  return url.origin;
}
