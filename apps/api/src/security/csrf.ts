import { createHmac, timingSafeEqual } from "node:crypto";

export const CSRF_HEADER_NAME = "x-wayloom-csrf";

const stateChangingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isStateChangingMethod(method: string): boolean {
  return stateChangingMethods.has(method.toUpperCase());
}

export function createCsrfToken(sessionToken: string): string {
  return createHmac("sha256", "wayloom-csrf").update(sessionToken).digest("base64url");
}

export function csrfTokenMatches(sessionToken: string, presented: string | undefined): boolean {
  if (presented === undefined || presented.length === 0 || presented.includes(sessionToken)) {
    return false;
  }
  const expected = Buffer.from(createCsrfToken(sessionToken));
  const actual = Buffer.from(presented);
  if (expected.length !== actual.length) {
    return false;
  }
  return timingSafeEqual(expected, actual);
}
