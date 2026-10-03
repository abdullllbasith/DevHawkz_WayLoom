import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultDeferredOrders,
  defaultPlanningKpis,
  defaultVehicleAssignments,
  filterVehicles,
} from "./dispatcher-planning.ts";

test("filterVehicles filters by vehicle type correctly", () => {
  const reefers = filterVehicles(defaultVehicleAssignments, "Reefer", "");
  assert.equal(reefers.every((v) => v.type === "Reefer"), true);
  assert.equal(reefers.length, 3);

  const vans = filterVehicles(defaultVehicleAssignments, "Van", "");
  assert.equal(vans.every((v) => v.type === "Van"), true);
  assert.equal(vans.length, 3);

  const trucks = filterVehicles(defaultVehicleAssignments, "Truck", "");
  assert.equal(trucks.every((v) => v.type === "Truck"), true);
  assert.equal(trucks.length, 2);
});

test("filterVehicles filters by query string across vehicleId, driver, route", () => {
  const byId = filterVehicles(defaultVehicleAssignments, "All", "veh001");
  assert.equal(byId.length, 1);
  assert.equal(byId[0]?.vehicleId, "VEH001");

  const byDriver = filterVehicles(defaultVehicleAssignments, "All", "ahmed");
  assert.equal(byDriver.length, 1);
  assert.equal(byDriver[0]?.driver, "Ahmed R.");

  const byRoute = filterVehicles(defaultVehicleAssignments, "All", "r3");
  assert.equal(byRoute.length, 1);
  assert.equal(byRoute[0]?.routeId, "R3");
});

test("defaultPlanningKpis retain Designathon canonical values", () => {
  assert.equal(defaultPlanningKpis.vehiclesAssigned, "18");
  assert.equal(defaultPlanningKpis.ordersScheduled, "102");
  assert.equal(defaultPlanningKpis.ordersDeferred, "3");
  assert.equal(defaultPlanningKpis.estimatedOnTime, "96%");
  assert.equal(defaultPlanningKpis.constraintViolations, "0");
});

test("defaultDeferredOrders maintain structured constraint codes", () => {
  assert.equal(defaultDeferredOrders.length, 3);
  assert.equal(defaultDeferredOrders[0]?.constraintCode, "TIME_BUDGET");
  assert.equal(defaultDeferredOrders[2]?.constraintCode, "NO_CAPACITY");
});
