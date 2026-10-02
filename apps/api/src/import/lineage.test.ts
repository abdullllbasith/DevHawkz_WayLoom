import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { HACKATHON_DATASET_FILES } from "./datasets.js";
import { validateVehicleCsv } from "./vehicles.js";

test("source lineage keeps calculated fuel and travel off master and trip records", async () => {
  assert.deepEqual([...HACKATHON_DATASET_FILES], ["outlets.csv", "vehicles.csv", "calendar.csv"]);
  const schema = await readFile(
    path.resolve(import.meta.dirname, "../../prisma/schema.prisma"),
    "utf8",
  );
  const vehicle = modelBlock(schema, "Vehicle");
  const trip = modelBlock(schema, "Trip");
  const outlet = modelBlock(schema, "Outlet");
  assert.match(vehicle, /kmPerL/);
  assert.match(vehicle, /weeklyFuelQuotaL/);
  assert.doesNotMatch(vehicle, /fuelUsed|fuel_used/);
  assert.doesNotMatch(trip, /fuelUsed|fuel_used|serviceAllowance|depot_to_district|inter_stop/);
  assert.doesNotMatch(outlet, /serviceAllowance|depot_to_district/);
  assert.doesNotMatch(schema, /model OrderLine|model Datathon/);

  const validated = validateVehicleCsv(
    "vehicle_id,type,temp,weight_cap_kg,volume_cap_m3,fuel_type,km_per_l,weekly_fuel_quota_l,depot\nV1,van,ambient,1000,10,diesel,8.5,200,Peliyagoda\n",
  );
  assert.equal(validated.errors.length, 0);
  assert.equal(validated.rows[0]?.kmPerL, "8.5");
  assert.equal(validated.rows[0]?.weeklyFuelQuotaL, "200");
  assert.equal("fuelUsedL" in (validated.rows[0] ?? {}), false);
});

function modelBlock(schema: string, modelName: string): string {
  const match = schema.match(new RegExp(`model ${modelName} \\{[^}]*\\}`));
  assert.ok(match, `${modelName} is missing`);
  return match[0];
}
