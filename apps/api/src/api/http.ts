import type { IncomingMessage, ServerResponse } from "node:http";
import { sendError } from "../errors.js";

const transitionCodes = new Set(["invalid_transition", "lifecycle_conflict", "prerequisite_missing"]);

export function sendDomainFailure(response: ServerResponse, code: string): void {
  if (code === "invalid_input") {
    sendError(response, 400, code, "");
    return;
  }
  if (code === "not_found" || code === "object_scope_failure") {
    sendError(response, 404, code, "");
    return;
  }
  if (code === "authorization_failure") {
    sendError(response, 403, code, "");
    return;
  }
  if (code === "concurrency_conflict" || code === "invariant_violation" || code === "conflict" || transitionCodes.has(code)) {
    sendError(response, 409, code, "");
    return;
  }
  sendError(response, 500, "persistence_failure", "");
}

export async function readJson(request: IncomingMessage): Promise<unknown | "invalid"> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 16384) {
      return "invalid";
    }
    chunks.push(buffer);
  }
  if (size === 0) {
    return {};
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    return "invalid";
  }
}
