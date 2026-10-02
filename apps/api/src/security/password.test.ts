import assert from "node:assert/strict";
import test from "node:test";

import { hashPassword, verifyPassword } from "./password.js";

const password = "correct-horse";
const otherPassword = "other-horse";

test("an Argon2id hash verifies only the original password", async () => {
  const calls: string[] = [];
  const originals = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  for (const method of ["log", "info", "warn", "error"] as const) {
    console[method] = (message?: unknown) => {
      calls.push(String(message));
    };
  }
  try {
    const stored = await hashPassword(password);
    const again = await hashPassword(password);
    assert.match(stored, /^\$argon2id\$/);
    assert.notEqual(stored, password);
    assert.equal(stored.includes(password), false);
    assert.notEqual(stored, again);
    assert.equal(await verifyPassword(stored, password), true);
    assert.equal(await verifyPassword(stored, "wrong-horse"), false);
    assert.equal(await verifyPassword(stored, otherPassword), false);
    assert.equal(await verifyPassword("not-a-hash", password), false);
    assert.equal(await verifyPassword("$argon2id$broken", password), false);
  } finally {
    console.log = originals.log;
    console.info = originals.info;
    console.warn = originals.warn;
    console.error = originals.error;
  }
  assert.deepEqual(calls, []);
});
