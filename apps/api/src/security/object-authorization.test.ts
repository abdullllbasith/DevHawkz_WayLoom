import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizeDispatcherOperational,
  authorizeDriverDelivery,
  authorizeDriverRoute,
  authorizeIdentityChange,
  authorizeLoaderTask,
  authorizeStoreManagerOutlet,
} from "./object-authorization.js";

const otherManager = "44444444-4444-4444-8444-444444444445";
const driver = "33333333-3333-4333-8333-333333333333";
const otherDriver = "33333333-3333-4333-8333-333333333334";
const loader = "22222222-2222-4222-8222-222222222222";
const otherLoader = "22222222-2222-4222-8222-222222222223";
const outletA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const outletB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";

test("a Store Manager can use only assigned outlets", () => {
  const assigned = [outletA];
  assert.deepEqual(
    authorizeStoreManagerOutlet({
      role: "STORE_MANAGER",
      assignedOutletIds: assigned,
      outletId: outletA,
      action: "read",
    }),
    { allowed: true },
  );
  assert.deepEqual(
    authorizeStoreManagerOutlet({
      role: "STORE_MANAGER",
      assignedOutletIds: assigned,
      outletId: outletB,
      action: "read",
    }),
    { allowed: false },
  );
  assert.deepEqual(
    authorizeStoreManagerOutlet({
      role: "STORE_MANAGER",
      assignedOutletIds: assigned,
      outletId: outletB,
      action: "mutate",
    }),
    { allowed: false },
  );
  assert.deepEqual(
    authorizeStoreManagerOutlet({
      role: "STORE_MANAGER",
      assignedOutletIds: [],
      outletId: outletA,
      action: "mutate",
    }),
    { allowed: false },
  );
  const outside = authorizeStoreManagerOutlet({
    role: "STORE_MANAGER",
    assignedOutletIds: assigned,
    outletId: outletB,
    action: "read",
  });
  assert.deepEqual(outside, { allowed: false });
  assert.equal(JSON.stringify(outside).includes(outletB), false);
  assert.equal(JSON.stringify(outside).includes(otherManager), false);
});

test("driver and loader access follows the stored assignment", () => {
  assert.deepEqual(
    authorizeDriverRoute({
      role: "DRIVER",
      userId: driver,
      vehicleDriverUserId: driver,
      action: "read",
    }),
    { allowed: true },
  );
  assert.deepEqual(
    authorizeDriverRoute({
      role: "DRIVER",
      userId: driver,
      vehicleDriverUserId: otherDriver,
      action: "read",
    }),
    { allowed: false },
  );
  assert.deepEqual(
    authorizeDriverRoute({
      role: "DRIVER",
      userId: driver,
      vehicleDriverUserId: null,
      action: "mutate",
    }),
    { allowed: false },
  );
  assert.deepEqual(
    authorizeDriverDelivery({
      role: "DRIVER",
      userId: driver,
      deliveryDriverUserId: otherDriver,
      action: "mutate",
    }),
    { allowed: false },
  );
  assert.deepEqual(
    authorizeDriverDelivery({
      role: "DRIVER",
      userId: driver,
      deliveryDriverUserId: driver,
      action: "mutate",
    }),
    { allowed: true },
  );
  assert.deepEqual(
    authorizeLoaderTask({
      role: "LOADER",
      userId: loader,
      loaderUserId: loader,
      action: "read",
    }),
    { allowed: true },
  );
  assert.deepEqual(
    authorizeLoaderTask({
      role: "LOADER",
      userId: loader,
      loaderUserId: otherLoader,
      action: "read",
    }),
    { allowed: false },
  );
  assert.deepEqual(
    authorizeLoaderTask({
      role: "LOADER",
      userId: loader,
      loaderUserId: otherLoader,
      action: "mutate",
    }),
    { allowed: false },
  );
  assert.deepEqual(
    authorizeLoaderTask({
      role: "LOADER",
      userId: loader,
      loaderUserId: null,
      action: "mutate",
    }),
    { allowed: false },
  );
});

test("a Dispatcher can reach operational records and cannot change identity", () => {
  for (const target of ["order", "trip", "tripStop", "loadingRecord", "deliveryRecord", "proofOfDelivery", "deferral", "exception", "receipt"]) {
    assert.deepEqual(
      authorizeDispatcherOperational({ role: "DISPATCHER", target, action: "read" }),
      { allowed: true },
    );
  }
  assert.deepEqual(
    authorizeDispatcherOperational({ role: "DISPATCHER", target: "user", action: "mutate" }),
    { allowed: false },
  );
  assert.deepEqual(authorizeIdentityChange(), { allowed: false });
  assert.deepEqual(
    authorizeStoreManagerOutlet({
      role: "DISPATCHER",
      assignedOutletIds: [outletA],
      outletId: outletA,
      action: "read",
    }),
    { allowed: false },
  );
});
