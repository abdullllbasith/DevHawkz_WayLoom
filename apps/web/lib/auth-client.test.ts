import assert from "node:assert/strict";
import test from "node:test";

import {
  ROLE_OPTIONS,
  roleWorkspace,
  validateLoginForm,
} from "./auth-client.ts";

test("validateLoginForm requires both login identifier and password", () => {
  const empty = validateLoginForm({ loginIdentifier: "", password: "" });
  assert.equal(empty.loginIdentifier, "Work email or username is required.");
  assert.equal(empty.password, "Password is required.");

  const noPassword = validateLoginForm({ loginIdentifier: "seed.dispatcher", password: "" });
  assert.equal(noPassword.loginIdentifier, undefined);
  assert.equal(noPassword.password, "Password is required.");

  const valid = validateLoginForm({ loginIdentifier: "seed.dispatcher", password: "wayloom-dev-only" });
  assert.equal(Object.keys(valid).length, 0);
});

test("roleWorkspace resolves DISPATCHER to /dispatcher", () => {
  assert.equal(roleWorkspace("DISPATCHER"), "/dispatcher");
  assert.equal(roleWorkspace("dispatcher"), "/dispatcher");
  assert.equal(roleWorkspace("LOADER"), "/loader");
  assert.equal(roleWorkspace("loader"), "/loader");
});

test("ROLE_OPTIONS includes the 4 canonical Designathon roles", () => {
  assert.equal(ROLE_OPTIONS.length, 4);
  const labels = ROLE_OPTIONS.map((r) => r.label);
  assert.deepEqual(labels, ["Dispatcher", "Loader", "Driver", "Store Manager"]);
});
