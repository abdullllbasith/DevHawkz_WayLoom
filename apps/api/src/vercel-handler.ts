import type { IncomingMessage, ServerResponse } from "node:http";
import { loadConfig } from "./config.js";
import { createApiListener } from "./create-listener.js";

type ApiListener = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

let listener: ApiListener | undefined;

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const originalUrl = request.url;
  request.url = mapVercelUrl(originalUrl);
  try {
    listener ??= createApiListener(loadConfig());
    await listener(request, response);
  } finally {
    request.url = originalUrl;
  }
}

function mapVercelUrl(url: string | undefined): string {
  const raw = url ?? "/";
  const parsed = new URL(raw, "http://127.0.0.1");
  const routed = parsed.searchParams.get("wl");
  if (routed && routed.startsWith("/")) {
    parsed.searchParams.delete("wl");
    const query = parsed.searchParams.toString();
    return query.length > 0 ? `${routed}?${query}` : routed;
  }
  if (parsed.pathname === "/api/health") {
    return `/health${parsed.search}`;
  }
  if (parsed.pathname === "/api/ready") {
    return `/ready${parsed.search}`;
  }
  return raw;
}
