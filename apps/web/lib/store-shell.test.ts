import assert from "node:assert/strict";
import test from "node:test";

import { activeStoreHref, parseStoreIdentity, storeAccess, storeNavigation, storeShellMode } from "./store-shell.ts";

test("store access follows the authenticated role", () => {
  assert.equal(storeAccess(null), "anonymous");
  assert.equal(storeAccess("DISPATCHER"), "forbidden");
  assert.equal(storeAccess("LOADER"), "forbidden");
  assert.equal(storeAccess("DRIVER"), "forbidden");
  assert.equal(storeAccess("STORE_MANAGER"), "allowed");
});

test("submitted store navigation stays inside the four store areas", () => {
  assert.deepEqual(
    storeNavigation.map((item) => item.label),
    ["Store Dashboard", "Pending Deliveries", "Received Deliveries", "Create Order"],
  );
  assert.equal(activeStoreHref("/store"), "/store");
  assert.equal(activeStoreHref("/store/orders/new"), "/store/orders/new");
  assert.equal(activeStoreHref("/store/orders/order-1"), "/store/orders");
  assert.equal(activeStoreHref("/store/receipts"), "/store/receipts");
  assert.equal(storeNavigation.some((item) => item.label === "Messages"), false);
  assert.equal(storeNavigation.some((item) => item.label === "Support"), false);
});

test("store identity ignores other roles and the shell is responsive", () => {
  assert.equal(parseStoreIdentity({ user: { displayName: "Seed Store Manager", role: "STORE_MANAGER" } })?.displayName, "Seed Store Manager");
  assert.equal(parseStoreIdentity({ user: { displayName: "Driver", role: "DRIVER" } }), null);
  assert.equal(storeShellMode(390), "phone");
  assert.equal(storeShellMode(767), "phone");
  assert.equal(storeShellMode(768), "desktop");
});
