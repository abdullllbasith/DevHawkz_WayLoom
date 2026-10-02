import assert from "node:assert/strict";
import test from "node:test";

import { assertImportDatabaseTarget } from "../import/database-target.js";
import {
  hashSeedPassword,
  sameSeedOrder,
  SEED_PASSWORD,
  seedOrder,
  seedPasswordMatches,
  seedUsers,
} from "./scenario.js";

test("the development seed uses four roles and does not store the password as plaintext", async () => {
  assert.deepEqual(
    seedUsers.map((user) => user.role),
    ["DISPATCHER", "LOADER", "DRIVER", "STORE_MANAGER"],
  );
  assert.equal(seedOrder.status, "SUBMITTED");
  assert.equal(seedOrder.outletSourceId, "OUT001");
  const passwordHash = await hashSeedPassword();
  assert.notEqual(passwordHash, SEED_PASSWORD);
  assert.equal(await seedPasswordMatches(passwordHash), true);
  assert.equal(
    sameSeedOrder({
      deliveryId: seedOrder.deliveryId,
      orderDate: new Date("2026-06-02T00:00:00.000Z"),
      outletSourceId: "OUT001",
      createdByLogin: "seed.store-manager",
      status: "SUBMITTED",
      tempRequirement: "chilled",
      orderUnits: 10,
      orderWeightKg: "50",
      orderVolumeM3: "1.5",
      submittedAt: new Date(seedOrder.submittedAt),
    }),
    true,
  );
});

test("the seed refuses a production database target", () => {
  assert.throws(
    () =>
      assertImportDatabaseTarget(
        "postgresql://wayloom_app:secret@127.0.0.1:5432/wayloom_development",
        "production",
      ),
    /production/,
  );
});
