import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "./config.js";

const production = {
  NODE_ENV: "production",
  API_HOST: "0.0.0.0",
  API_PORT: "4000",
  LOGIN_RATE_LIMIT_MAX: "20",
  LOGIN_RATE_LIMIT_WINDOW_SECONDS: "900",
  DATABASE_URL: "postgresql://wayloom_app:real-secret@db.internal:5432/wayloom_production",
  WEB_ORIGIN: "https://app.example",
  WEB_HTTPS: "true",
};

test("production configuration fails when a required variable is missing", () => {
  assert.throws(() => loadConfig({ ...production, API_HOST: undefined }), /API_HOST is required/);
  assert.throws(() => loadConfig({ ...production, API_PORT: "" }), /API_PORT is required/);
  assert.throws(
    () =>
      loadConfig({
        ...production,
        LOGIN_RATE_LIMIT_MAX: undefined,
        LOGIN_RATE_LIMIT_WINDOW_SECONDS: undefined,
      }),
    /LOGIN_RATE_LIMIT_MAX/,
  );
  assert.throws(() => loadConfig({ ...production, DATABASE_URL: undefined }), /DATABASE_URL is required/);
});

test("a valid production configuration does not expose the database password", () => {
  const config = loadConfig(production);
  assert.equal(config.nodeEnv, "production");
  assert.equal(config.host, "0.0.0.0");
  assert.equal(config.port, 4000);
  assert.equal(config.httpSecurity.httpsEnabled, true);
  assert.equal(config.httpSecurity.browserOrigin, "https://app.example");
  assert.equal(JSON.stringify(config).includes("real-secret"), false);
});

test("development keeps the local defaults", () => {
  const config = loadConfig({
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://wayloom_app:PASSWORD@127.0.0.1:5432/wayloom_development",
  });
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 4000);
  assert.equal(config.logLevel, "info");
  assert.equal(config.httpSecurity.httpsEnabled, false);
  assert.equal(config.loginRateLimit.maxFailures, 20);
});
