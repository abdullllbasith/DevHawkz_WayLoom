import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { securityHeaders, parseBrowserOrigin, parseHttpsEnabled } from "./security/http-security.js";
import { buildSessionCookie } from "./security/session.js";

const here = dirname(fileURLToPath(import.meta.url));

test("production cookies and headers reject an insecure fallback", () => {
  const cookie = buildSessionCookie("session-token", "production");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure/);
  assert.equal(buildSessionCookie("session-token", "development").includes("Secure"), false);
  assert.throws(() => parseBrowserOrigin("http://app.example", "production"), /https origin/);
  assert.equal(parseHttpsEnabled("false", "production"), false);
  const headers = securityHeaders({ nodeEnv: "production", httpsEnabled: true, pathname: "/api/orders" });
  assert.equal(headers["strict-transport-security"], "max-age=31536000");
  assert.equal(headers["cache-control"], "no-store");
  const withoutHttps = securityHeaders({ nodeEnv: "production", httpsEnabled: false, pathname: "/health" });
  assert.equal(withoutHttps["strict-transport-security"], undefined);
});

test("browser clients do not store the session token", () => {
  const web = readFileSync(resolve(here, "../../web/lib/api-client.ts"), "utf8");
  const offline = readFileSync(resolve(here, "../../web/lib/offline-boundary.ts"), "utf8");
  assert.equal(web.includes("localStorage"), false);
  assert.equal(offline.includes("sessionToken"), true);
  assert.equal(offline.includes("password"), true);
});
