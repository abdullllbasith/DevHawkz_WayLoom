import assert from "node:assert/strict";
import test from "node:test";

import { WAYLOOM_CSRF_HEADER } from "./api-client.ts";
import {
  activeDispatcherHref,
  dispatcherAccess,
  dispatcherNavigation,
  logoutHeaders,
  parseDispatcherIdentity,
  sessionRole,
  shellNavigationMode,
} from "./dispatcher-shell.ts";

test("dispatcher access follows the authenticated role", () => {
  assert.equal(dispatcherAccess(null), "anonymous");
  assert.equal(dispatcherAccess("LOADER"), "forbidden");
  assert.equal(dispatcherAccess("DRIVER"), "forbidden");
  assert.equal(dispatcherAccess("STORE_MANAGER"), "forbidden");
  assert.equal(dispatcherAccess("DISPATCHER"), "allowed");
});

test("primary navigation resolves to the submitted dispatcher routes", () => {
  const hrefs = dispatcherNavigation.map((item) => item.href);
  assert.deepEqual(hrefs, [
    "/dispatcher",
    "/dispatcher/orders",
    "/dispatcher/planning",
    "/dispatcher/vehicles",
    "/dispatcher/routes",
    "/dispatcher/workflow",
    "/dispatcher/analytics",
    "/dispatcher/reports",
    "/dispatcher/settings",
  ]);
  assert.equal(activeDispatcherHref("/dispatcher"), "/dispatcher");
  assert.equal(activeDispatcherHref("/dispatcher/orders"), "/dispatcher/orders");
  assert.equal(activeDispatcherHref("/dispatcher/planning"), "/dispatcher/planning");
  assert.equal(activeDispatcherHref("/dispatcher/allocation-confirmation"), "/dispatcher/planning");
  assert.equal(activeDispatcherHref("/dispatcher/deferrals"), "/dispatcher/planning");
  assert.equal(activeDispatcherHref("/dispatcher/vehicles"), "/dispatcher/vehicles");
  assert.equal(activeDispatcherHref("/dispatcher/routes"), "/dispatcher/routes");
  assert.equal(activeDispatcherHref("/dispatcher/routes/route-1"), "/dispatcher/routes");
  assert.equal(activeDispatcherHref("/dispatcher/workflow"), "/dispatcher/workflow");
  assert.equal(activeDispatcherHref("/dispatcher/analytics"), "/dispatcher/analytics");
  assert.equal(activeDispatcherHref("/dispatcher/reports"), "/dispatcher/reports");
  assert.equal(activeDispatcherHref("/dispatcher/settings"), "/dispatcher/settings");
  assert.equal(activeDispatcherHref("/dispatcher/orders/extra"), "/dispatcher/orders");
  assert.equal(dispatcherNavigation.some((item) => item.label === "Deferrals"), false);
  assert.equal(dispatcherNavigation.some((item) => item.label === "Exceptions"), false);
  assert.equal(dispatcherNavigation.some((item) => item.label === "Allocation Confirmation"), false);
});

test("session identity, logout, and the narrow shell stay inside the approved boundary", () => {
  assert.equal(parseDispatcherIdentity({ user: { displayName: "Seed Dispatcher", role: "DISPATCHER", password: "secret" } })?.displayName, "Seed Dispatcher");
  assert.equal(sessionRole({ user: { displayName: "Loader", role: "LOADER" } }), "LOADER");
  assert.equal(parseDispatcherIdentity({ user: { displayName: "Loader", role: "LOADER" } }), null);
  assert.equal(parseDispatcherIdentity({ user: { role: "DISPATCHER" } }), null);
  const headers = logoutHeaders("csrf-token");
  assert.equal(headers.get(WAYLOOM_CSRF_HEADER), "csrf-token");
  assert.equal(shellNavigationMode(1280), "desktop");
  assert.equal(shellNavigationMode(1024), "desktop");
  assert.equal(shellNavigationMode(1023), "narrow");
  assert.equal(dispatcherNavigation.some((item) => item.label === "AI Planning"), true);
  assert.equal(dispatcherNavigation.some((item) => item.label === "Analytics"), true);
});
