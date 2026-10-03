import assert from "node:assert/strict";
import test from "node:test";

import { activeDriverHref, driverAccess, driverNavigation, driverShellMode, parseDriverIdentity } from "./driver-shell.ts";

test("driver access follows the authenticated role", () => {
  assert.equal(driverAccess(null), "anonymous");
  assert.equal(driverAccess("LOADER"), "forbidden");
  assert.equal(driverAccess("DISPATCHER"), "forbidden");
  assert.equal(driverAccess("STORE_MANAGER"), "forbidden");
  assert.equal(driverAccess("DRIVER"), "allowed");
});

test("submitted driver navigation stays inside delivery work", () => {
  assert.deepEqual(
    driverNavigation.map((item) => item.label),
    ["My Routes", "Delivery Stop Details", "Delivery Outcome", "Proof of Delivery"],
  );
  assert.equal(activeDriverHref("/driver"), "/driver");
  assert.equal(activeDriverHref("/driver/stops/stop-1"), "/driver/stops");
  assert.equal(activeDriverHref("/driver/outcome"), "/driver/outcome");
  assert.equal(activeDriverHref("/driver/pod"), "/driver/pod");
  assert.equal(driverNavigation.some((item) => item.label === "Messages"), false);
  assert.equal(driverNavigation.some((item) => item.label === "Loading"), false);
});

test("driver identity ignores other roles and the shell is phone-first", () => {
  assert.equal(parseDriverIdentity({ user: { displayName: "Seed Driver", role: "DRIVER" } })?.displayName, "Seed Driver");
  assert.equal(parseDriverIdentity({ user: { displayName: "Loader", role: "LOADER" } }), null);
  assert.equal(driverShellMode(390), "phone");
  assert.equal(driverShellMode(767), "phone");
  assert.equal(driverShellMode(768), "tablet");
});
