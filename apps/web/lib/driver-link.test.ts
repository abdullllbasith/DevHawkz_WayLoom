import assert from "node:assert/strict";
import test from "node:test";

import { driverLinkPhase } from "./driver-link.ts";

test("the driver link follows the browser, the server, and an in-flight sync", () => {
  assert.equal(driverLinkPhase({ browserOnline: true, serverReachable: true, syncInFlight: false }), "online");
  assert.equal(driverLinkPhase({ browserOnline: false, serverReachable: true, syncInFlight: true }), "offline");
  assert.equal(driverLinkPhase({ browserOnline: true, serverReachable: false, syncInFlight: false }), "offline");
  assert.equal(driverLinkPhase({ browserOnline: true, serverReachable: false, syncInFlight: true }), "syncing");
  assert.equal(driverLinkPhase({ browserOnline: true, serverReachable: true, syncInFlight: true }), "syncing");
});
