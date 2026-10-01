import type { IncomingMessage, ServerResponse } from "node:http";
import type { NodeEnvironment } from "./config.js";
import { logUnexpectedError, sendError, sendJson } from "./errors.js";
import type { Logger } from "./log.js";

export type AppOptions = {
  nodeEnv: NodeEnvironment;
  log: Logger;
};

export function createApp(options: AppOptions) {
  return function handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): void {
    try {
      const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      if (pathname !== "/health") {
        sendError(response, 404, "not_found", "Not found.");
        return;
      }
      if (request.method !== "GET") {
        sendError(response, 405, "method_not_allowed", "Method not allowed.");
        return;
      }
      sendJson(response, 200, { status: "ok" });
    } catch (error) {
      logUnexpectedError(options.log, options.nodeEnv, error);
      if (!response.headersSent) {
        sendError(response, 500, "internal_error", "Internal server error.");
      }
    }
  };
}
