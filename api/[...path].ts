import type { IncomingMessage, ServerResponse } from "node:http";

export const config = {
  maxDuration: 60,
};

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const { default: api } = await import("../apps/api/dist/vercel-handler.js");
  await api(request, response);
}
