/**
 * Authenticated dispatcher lifecycle smoke against a running API (127.0.0.1:4000).
 * Expects gate-local-setup to have run against the same DATABASE_URL the API uses.
 */
const API = process.env.API_BASE_URL ?? "http://127.0.0.1:4000";
const SEED_PASSWORD = "wayloom-dev-only";
const OPERATIONAL_DATE = "2026-06-02";
const SEED_DELIVERY_ID = "SEED-2026-06-02-OUT001";

const dispatcher = { loginIdentifier: "seed.dispatcher", password: SEED_PASSWORD };

async function main() {
  const dispatcherSession = await login(dispatcher);
  const orders = await getJson("/api/orders?orderDate=" + OPERATIONAL_DATE, dispatcherSession.cookie);
  const seedOrder = orders.find((order) => order.deliveryId === SEED_DELIVERY_ID);
  if (seedOrder === undefined) {
    throw new Error(`Seed order ${SEED_DELIVERY_ID} not found.`);
  }
  if (seedOrder.status !== "SUBMITTED") {
    throw new Error(`Expected SUBMITTED seed order, got ${seedOrder.status}.`);
  }

  const closed = await postJson(`/api/orders/${seedOrder.id}/confirm`, dispatcherSession.cookie, dispatcherSession.csrf, {});
  if (closed.status !== "CONFIRMED") {
    throw new Error(`Close order failed: ${JSON.stringify(closed)}`);
  }

  const planRun = await postJson("/api/planning/run", dispatcherSession.cookie, dispatcherSession.csrf, {
    operationalDate: OPERATIONAL_DATE,
  });
  const planRead = await getJson(`/api/planning/${OPERATIONAL_DATE}`, dispatcherSession.cookie);
  const trips = planRead.trips ?? [];
  const deferrals = planRead.deferrals ?? [];

  let tripConfirmStatus = "skipped";
  if (trips.length > 0) {
    const planned = trips.find((trip) => trip.status === "PLANNED") ?? trips[0];
    const confirmedTrip = await postJson(
      `/api/trips/${planned.id}/confirm`,
      dispatcherSession.cookie,
      dispatcherSession.csrf,
      {},
    );
    tripConfirmStatus = confirmedTrip.status ?? "unknown";
  }

  console.log(
    JSON.stringify(
      {
        orderClose: closed.status,
        planningRun: { tripCount: planRun.trips?.length ?? 0, deferralCount: planRun.deferrals?.length ?? 0 },
        planningRead: { tripCount: trips.length, deferralCount: deferrals.length, trips, deferrals },
        tripAllocationConfirm: tripConfirmStatus,
      },
      null,
      2,
    ),
  );
}

async function login(user) {
  const response = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(user),
  });
  if (!response.ok) {
    throw new Error(`Login failed for ${user.loginIdentifier}: ${response.status}`);
  }
  const cookie = extractCookie(response.headers.get("set-cookie"));
  const csrfResponse = await fetch(`${API}/api/auth/csrf`, { headers: { cookie } });
  if (!csrfResponse.ok) {
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
