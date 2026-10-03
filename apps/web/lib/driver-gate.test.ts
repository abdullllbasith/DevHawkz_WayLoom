import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { driverNavigation } from "./driver-shell.ts";

const root = resolve(import.meta.dirname, "..");

test("driver gate keeps the approved navigation and rejects invented tracking", () => {
  assert.deepEqual(
    driverNavigation.map((item) => item.label),
    ["My Routes", "Delivery Stop Details", "Delivery Outcome", "Proof of Delivery"],
  );
  const source = [
    "app/driver/page.tsx",
    "app/driver/stops/[tripId]/page.tsx",
    "app/driver/outcome/page.tsx",
    "app/driver/pod/page.tsx",
  ]
    .map((path) => readFileSync(resolve(root, path), "utf8"))
    .join("\n");
  assert.equal(source.includes("You're offline"), false);
  assert.equal(source.includes("Continue Navigation"), false);
  assert.equal(source.includes("localStorage"), false);
  assert.equal(source.includes("TechWave"), false);
});
