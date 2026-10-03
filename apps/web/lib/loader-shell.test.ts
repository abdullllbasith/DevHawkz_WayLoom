import assert from "node:assert/strict";
import test from "node:test";

import { activeLoaderHref, loaderAccess, loaderNavigation, loaderShellMode, parseLoaderIdentity } from "./loader-shell.ts";

test("loader access follows the authenticated role", () => {
  assert.equal(loaderAccess(null), "anonymous");
  assert.equal(loaderAccess("DISPATCHER"), "forbidden");
  assert.equal(loaderAccess("DRIVER"), "forbidden");
  assert.equal(loaderAccess("STORE_MANAGER"), "forbidden");
  assert.equal(loaderAccess("LOADER"), "allowed");
});

test("submitted loader navigation stays inside loading work", () => {
  assert.deepEqual(
    loaderNavigation.map((item) => item.href),
    ["/loader", "/loader/loading", "/loader/checklist", "/loader/records"],
  );
  assert.equal(activeLoaderHref("/loader"), "/loader");
  assert.equal(activeLoaderHref("/loader/loading"), "/loader/loading");
  assert.equal(activeLoaderHref("/loader/loading/trip-1"), "/loader/loading");
  assert.equal(activeLoaderHref("/loader/checklist"), "/loader/checklist");
  assert.equal(activeLoaderHref("/loader/records"), "/loader/records");
  assert.equal(loaderNavigation.some((item) => item.label === "Orders"), false);
  assert.equal(loaderNavigation.some((item) => item.label === "Routes"), false);
});

test("loader identity ignores other roles and the shell is phone-first", () => {
  assert.equal(parseLoaderIdentity({ user: { displayName: "Seed Loader", role: "LOADER" } })?.displayName, "Seed Loader");
  assert.equal(parseLoaderIdentity({ user: { displayName: "Dispatcher", role: "DISPATCHER" } }), null);
  assert.equal(loaderShellMode(390), "phone");
  assert.equal(loaderShellMode(767), "phone");
  assert.equal(loaderShellMode(768), "tablet");
});
