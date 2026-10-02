import type { ServerResponse } from "node:http";
import type { NodeEnvironment } from "./config.js";
import type { Logger } from "./log.js";

export type ErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

export function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  headers?: Record<string, string>,
): void {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    ...headers,
  });
  response.end(payload);
}

export function sendError(
  response: ServerResponse,
  statusCode: number,
  code: string,
  message: string,
): void {
  const body: ErrorBody = {
    error: {
      code,
      message,
    },
  };
  sendJson(response, statusCode, body);
}

export function logUnexpectedError(
  log: Logger,
  nodeEnv: NodeEnvironment,
  error: unknown,
): void {
  if (nodeEnv === "development" && error instanceof Error) {
    log.error(error.stack ?? error.message);
    return;
  }
  log.error("Unexpected API error.");
}
