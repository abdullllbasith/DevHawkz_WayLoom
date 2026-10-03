/**
 * Authenticated dispatcher lifecycle smoke against a running API (127.0.0.1:4000).
 * Expects gate-local-setup to have run against the same DATABASE_URL the API uses.
 */
const API = process.env.API_BASE_URL ?? "http://127.0.0.1:4000";
const SEED_PASSWORD = "wayloom-dev-only";
const OPERATIONAL_DATE = "2026-06-02";
const SEED_DELIVERY_ID = "SEED-2026-06-02-OUT001";
const SEED_ORDER_ID = "55555555-5555-4555-8555-555555555555";

const dispatcher = { loginIdentifier: "seed.dispatcher", password: SEED_PASSWORD };

/** @type {Record<string, "PASS" | "FAIL" | "SKIP">} */
const steps = {};

async function main() {
  try {
    const dispatcherSession = await login(dispatcher);
    steps["2_dispatcher_authenticates"] = "PASS";

    const orders = await getJson("/api/orders?orderDate=" + OPERATIONAL_DATE, dispatcherSession.cookie);
    const seedOrder = orders.find((order) => order.deliveryId === SEED_DELIVERY_ID);
    if (seedOrder === undefined) {
      steps["1_submitted_order_exists"] = "FAIL";
      throw new Error(`Seed order ${SEED_DELIVERY_ID} not found.`);
    }
    steps["1_submitted_order_exists"] =
      seedOrder.status === "SUBMITTED" && seedOrder.id === SEED_ORDER_ID ? "PASS" : "FAIL";
    if (steps["1_submitted_order_exists"] === "FAIL") {
      throw new Error(`Expected SUBMITTED seed order ${SEED_ORDER_ID}, got ${seedOrder.status}.`);
    }

    const closed = await postJson(`/api/orders/${seedOrder.id}/confirm`, dispatcherSession.cookie, dispatcherSession.csrf, {});
    steps["3_dispatcher_closes_order"] = closed.status === "CONFIRMED" ? "PASS" : "FAIL";
    steps["4_order_confirmed"] = steps["3_dispatcher_closes_order"];

    const planRun = await postJson("/api/planning/run", dispatcherSession.cookie, dispatcherSession.csrf, {
      operationalDate: OPERATIONAL_DATE,
    });
    const runTrips = planRun.trips ?? [];
    const runDeferrals = planRun.deferrals ?? [];
    steps["5_planning_run_executes"] = Array.isArray(runTrips) && Array.isArray(runDeferrals) ? "PASS" : "FAIL";
    steps["6_planning_produces_outcomes"] =
      runTrips.length > 0 || runDeferrals.length > 0 ? "PASS" : "FAIL";

    const planRead = await getJson(`/api/planning/${OPERATIONAL_DATE}`, dispatcherSession.cookie);
    const trips = planRead.trips ?? [];
    const deferrals = planRead.deferrals ?? [];
    steps["7_results_persisted"] =
      trips.length === runTrips.length && deferrals.length === runDeferrals.length ? "PASS" : "FAIL";
    steps["8_dispatcher_reads_planning"] = planRead.operationalDate === OPERATIONAL_DATE ? "PASS" : "FAIL";

    let tripConfirmStatus = null;
    let tripDetail = null;
    if (trips.length > 0) {
      const planned = trips.find((trip) => trip.status === "PLANNED") ?? trips[0];
      const confirmedTrip = await postJson(
        `/api/trips/${planned.id}/confirm`,
        dispatcherSession.cookie,
        dispatcherSession.csrf,
        {},
      );
      tripConfirmStatus = confirmedTrip.status ?? null;
      steps["9_trip_allocation_confirmed"] = tripConfirmStatus === "CONFIRMED" ? "PASS" : "FAIL";
      tripDetail = await getJson(`/api/trips/${planned.id}`, dispatcherSession.cookie);
      steps["10_routes_trip_stop_data"] =
        tripDetail.id === planned.id && Array.isArray(tripDetail.stops) && tripDetail.stops.length > 0
          ? "PASS"
          : "FAIL";
    } else {
      steps["9_trip_allocation_confirmed"] = "SKIP";
      steps["10_routes_trip_stop_data"] = "SKIP";
    }

    const deferralsList = await getJson("/api/deferrals", dispatcherSession.cookie);
    steps["11_deferrals_retrievable"] = Array.isArray(deferralsList) ? "PASS" : "FAIL";

    const exceptions = await getJson("/api/exceptions", dispatcherSession.cookie);
    steps["12_exceptions_accessible"] = Array.isArray(exceptions) ? "PASS" : "FAIL";

    const failed = Object.entries(steps).filter(([, value]) => value === "FAIL");
    console.log(
      JSON.stringify(
        {
          steps,
          seedOrderId: seedOrder.id,
          planningRun: { tripCount: runTrips.length, deferralCount: runDeferrals.length, trips: runTrips, deferrals: runDeferrals },
          planningRead: { tripCount: trips.length, deferralCount: deferrals.length },
          tripAllocationConfirm: tripConfirmStatus,
          tripDetailStops: tripDetail?.stops?.length ?? 0,
          deferralsListed: deferralsList.length,
          exceptionsListed: exceptions.length,
          overall: failed.length === 0 ? "PASS" : "FAIL",
        },
        null,
        2,
      ),
    );
    if (failed.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.log(JSON.stringify({ steps, error: error instanceof Error ? error.message : String(error), overall: "FAIL" }, null, 2));
    process.exit(1);
  }
}

async function login(user) {
  const response = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(user),
  });
  if (!response.ok) {
    steps["2_dispatcher_authenticates"] = "FAIL";
    throw new Error(`Login failed for ${user.loginIdentifier}: ${response.status}`);
  }
  const cookie = extractCookie(response.headers.get("set-cookie"));
  const csrfResponse = await fetch(`${API}/api/auth/csrf`, { headers: { cookie } });
  if (!csrfResponse.ok) {
    steps["2_dispatcher_authenticates"] = "FAIL";
    throw new Error("CSRF token fetch failed.");
  }
  const csrfBody = await csrfResponse.json();
  return { cookie, csrf: csrfBody.csrfToken };
}

async function getJson(path, cookie) {
  const response = await fetch(`${API}${path}`, { headers: { cookie } });
  if (!response.ok) {
    throw new Error(`GET ${path} failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function postJson(path, cookie, csrf, body) {
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json",
      "x-wayloom-csrf": csrf,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`POST ${path} failed: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

function extractCookie(setCookie) {
  if (setCookie === null) {
    throw new Error("Missing session cookie.");
  }
  const match = setCookie.match(/wayloom_session=[^;]+/);
  if (match === null) {
    throw new Error("Session cookie not found.");
  }
  return match[0];
}

main();
