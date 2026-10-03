import assert from "node:assert/strict";
import test from "node:test";

import {
  computeDeferralsKpis,
  DEFERRAL_REASON_INFO,
  exportDeferralsCsv,
  filterDeferralsList,
  isDeferralReasonCode,
  isPostCutoffOrder,
  mergeOrderDeferrals,
  readDeferralList,
  type EnrichedDeferral,
  type StoredDeferral,
} from "./dispatcher-deferrals.ts";
import type { DispatcherOrder } from "./dispatcher-orders.ts";

test("isDeferralReasonCode recognises all approved reasons and rejects unknown", () => {
  assert.equal(isDeferralReasonCode("NO_CAPACITY"), true);
  assert.equal(isDeferralReasonCode("NO_REEFER"), true);
  assert.equal(isDeferralReasonCode("VAN_ACCESS"), true);
  assert.equal(isDeferralReasonCode("WINDOW_CONFLICT"), true);
  assert.equal(isDeferralReasonCode("DEPOT_MISMATCH"), true);
  assert.equal(isDeferralReasonCode("TIME_BUDGET"), true);
  assert.equal(isDeferralReasonCode("FUEL_QUOTA"), true);

  assert.equal(isDeferralReasonCode("AI_REJECTED"), false);
  assert.equal(isDeferralReasonCode("LOW_PRIORITY"), false);
  assert.equal(isDeferralReasonCode(""), false);
});

test("readDeferralList parses valid entries and ignores malformed inputs", () => {
  assert.deepEqual(readDeferralList(null), []);
  assert.deepEqual(readDeferralList("invalid"), []);
  assert.deepEqual(readDeferralList([{ id: "1" }]), []);

  const input = [
    { id: "d1", orderId: "ord-1", reason: "NO_CAPACITY", reportedAt: "2026-06-02T10:00:00Z" },
    { id: "d2", orderId: "ord-2", reason: "FUEL_QUOTA", reportedAt: "2026-06-02T10:05:00Z" },
    { id: "d3", orderId: "ord-3", reason: "UNKNOWN_REASON" },
  ];

  const parsed = readDeferralList(input);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0]?.id, "d1");
  assert.equal(parsed[0]?.reason, "NO_CAPACITY");
  assert.equal(parsed[1]?.reason, "FUEL_QUOTA");
  assert.notEqual(parsed[0]?.reason, parsed[1]?.reason); // FUEL_QUOTA strictly distinct from NO_CAPACITY
});

test("DEFERRAL_REASON_INFO preserves authoritative constraint explanations without AI claims", () => {
  assert.equal(DEFERRAL_REASON_INFO.NO_CAPACITY.constraint, "Weight & Volume Capacity");
  assert.equal(DEFERRAL_REASON_INFO.FUEL_QUOTA.constraint, "Vehicle Fuel Allocation");
  assert.equal(DEFERRAL_REASON_INFO.NO_REEFER.constraint, "Temperature Control");
  assert.equal(DEFERRAL_REASON_INFO.VAN_ACCESS.constraint, "Access Restriction");
  assert.equal(DEFERRAL_REASON_INFO.WINDOW_CONFLICT.constraint, "Operating Time Window");
  assert.equal(DEFERRAL_REASON_INFO.DEPOT_MISMATCH.constraint, "Depot Compatibility");
  assert.equal(DEFERRAL_REASON_INFO.TIME_BUDGET.constraint, "Duty Hours & Driving Time");

  for (const info of Object.values(DEFERRAL_REASON_INFO)) {
    assert.equal(info.description.includes("AI"), false);
    assert.equal(info.description.includes("priority"), false);
  }
});

test("mergeOrderDeferrals enriches stored deferrals with matching order records", () => {
  const deferrals: StoredDeferral[] = [
    { id: "d1", orderId: "uuid-1", reason: "NO_REEFER", reportedAt: "2026-06-02T08:00:00Z" },
    { id: "d2", orderId: "uuid-missing", reason: "NO_CAPACITY", reportedAt: "2026-06-02T08:00:00Z" },
  ];

  const orders: DispatcherOrder[] = [
    {
      id: "uuid-1",
      orderId: "ORD-001",
      outlet: "OUT-COL-01",
      district: "Colombo",
      depot: "Peliyagoda",
      brand: "Fresh",
      items: 45,
      weightKg: "120.5",
      volumeM3: "1.2",
      temperature: "chilled",
      status: "DEFERRED",
      orderDate: "2026-06-03",
      submittedAt: "2026-06-02T07:30:00Z",
    },
  ];

  const enriched = mergeOrderDeferrals(deferrals, orders);
  assert.equal(enriched.length, 2);

  assert.equal(enriched[0]?.deliveryId, "ORD-001");
  assert.equal(enriched[0]?.outlet, "OUT-COL-01");
  assert.equal(enriched[0]?.brand, "Fresh");
  assert.equal(enriched[0]?.items, 45);
  assert.equal(enriched[0]?.temperature, "chilled");
  assert.equal(enriched[0]?.reason, "NO_REEFER");
  assert.equal(enriched[0]?.reasonInfo.label, "No Reefer Available");

  // Missing order gracefully falls back to honest —
  assert.equal(enriched[1]?.deliveryId, "uuid-missing");
  assert.equal(enriched[1]?.outlet, "—");
  assert.equal(enriched[1]?.items, 0);
  assert.equal(enriched[1]?.reason, "NO_CAPACITY");
});

test("isPostCutoffOrder distinguishes post-cutoff orders from next-day eligible", () => {
  const operationalDate = "2026-06-03";
  // Cutoff is 16:00:00 Asia/Colombo on 2026-06-02 = 10:30:00 UTC on 2026-06-02

  // Submitted before 16:00 Colombo (10:29 UTC) -> Eligible for next-day run
  assert.equal(isPostCutoffOrder("2026-06-02T10:29:59.000Z", operationalDate), false);

  // Submitted at exactly 16:00:00 Colombo (10:30:00 UTC) -> Following run
  assert.equal(isPostCutoffOrder("2026-06-02T10:30:00.000Z", operationalDate), true);

  // Submitted after 16:00 Colombo (11:00 UTC) -> Following run
  assert.equal(isPostCutoffOrder("2026-06-02T11:00:00.000Z", operationalDate), true);

  // Missing timestamp -> false
  assert.equal(isPostCutoffOrder(null, operationalDate), false);
});

test("computeDeferralsKpis aggregates totals and counts reasons correctly", () => {
  const sample: EnrichedDeferral[] = [
    {
      id: "d1",
      orderId: "o1",
      deliveryId: "ORD-1",
      outlet: "OUT-1",
      district: "Colombo",
      depot: "Peliyagoda",
      brand: "Fresh",
      items: 10,
      weightKg: "50",
      volumeM3: "0.5",
      temperature: "chilled",
      reason: "NO_CAPACITY",
      reasonInfo: DEFERRAL_REASON_INFO.NO_CAPACITY,
      reportedAt: "2026-06-02T08:00:00Z",
      status: "DEFERRED",
      orderDate: "2026-06-03",
      submittedAt: null,
    },
    {
      id: "d2",
      orderId: "o2",
      deliveryId: "ORD-2",
      outlet: "OUT-2",
      district: "Kandy",
      depot: "Kandy",
      brand: "Fresh",
      items: 20,
      weightKg: "75.5",
      volumeM3: "0.8",
      temperature: "chilled",
      reason: "NO_REEFER",
      reasonInfo: DEFERRAL_REASON_INFO.NO_REEFER,
      reportedAt: "2026-06-02T08:00:00Z",
      status: "DEFERRED",
      orderDate: "2026-06-03",
      submittedAt: null,
    },
    {
      id: "d3",
      orderId: "o3",
      deliveryId: "ORD-3",
      outlet: "OUT-3",
      district: "Galle",
      depot: "Peliyagoda",
      brand: "Tech",
      items: 5,
      weightKg: "25",
      volumeM3: "0.2",
      temperature: "ambient",
      reason: "FUEL_QUOTA",
      reasonInfo: DEFERRAL_REASON_INFO.FUEL_QUOTA,
      reportedAt: "2026-06-02T08:00:00Z",
      status: "DEFERRED",
      orderDate: "2026-06-03",
      submittedAt: null,
    },
  ];

  const kpis = computeDeferralsKpis(sample);
  assert.equal(kpis.totalDeferred, 3);
  assert.equal(kpis.totalUnits, 35);
  assert.equal(kpis.totalWeightKg, 150.5);
  assert.equal(kpis.capacityCount, 1);
  assert.equal(kpis.reeferCount, 1);
  assert.equal(kpis.fuelQuotaCount, 1);
  assert.equal(kpis.otherCount, 0);
});

test("filterDeferralsList filters by search, reason, depot, and brand", () => {
  const sample: EnrichedDeferral[] = [
    {
      id: "d1",
      orderId: "o1",
      deliveryId: "ORD-101",
      outlet: "Keells Colombo",
      district: "Colombo",
      depot: "Peliyagoda",
      brand: "Fresh",
      items: 10,
      weightKg: "50",
      volumeM3: "0.5",
      temperature: "chilled",
      reason: "NO_CAPACITY",
      reasonInfo: DEFERRAL_REASON_INFO.NO_CAPACITY,
      reportedAt: "2026-06-02T08:00:00Z",
      status: "DEFERRED",
      orderDate: "2026-06-03",
      submittedAt: null,
    },
    {
      id: "d2",
      orderId: "o2",
      deliveryId: "ORD-202",
      outlet: "Cargills Kandy",
      district: "Kandy",
      depot: "Kandy",
      brand: "Tech",
      items: 15,
      weightKg: "30",
      volumeM3: "0.4",
      temperature: "ambient",
      reason: "FUEL_QUOTA",
      reasonInfo: DEFERRAL_REASON_INFO.FUEL_QUOTA,
      reportedAt: "2026-06-02T08:00:00Z",
      status: "DEFERRED",
      orderDate: "2026-06-03",
      submittedAt: null,
    },
  ];

  assert.equal(filterDeferralsList(sample, { search: "", reason: "ALL", depot: "ALL", brand: "ALL" }).length, 2);
  assert.equal(filterDeferralsList(sample, { search: "kandy", reason: "ALL", depot: "ALL", brand: "ALL" }).length, 1);
  assert.equal(filterDeferralsList(sample, { search: "", reason: "FUEL_QUOTA", depot: "ALL", brand: "ALL" }).length, 1);
  assert.equal(filterDeferralsList(sample, { search: "", reason: "NO_CAPACITY", depot: "Kandy", brand: "ALL" }).length, 0);
  assert.equal(filterDeferralsList(sample, { search: "", reason: "ALL", depot: "ALL", brand: "fresh" }).length, 1);
});

test("exportDeferralsCsv formats valid CSV with authoritative columns", () => {
  const sample: EnrichedDeferral[] = [
    {
      id: "d1",
      orderId: "o1",
      deliveryId: "ORD-101",
      outlet: "Outlet, Colombo",
      district: "Colombo",
      depot: "Peliyagoda",
      brand: "Fresh",
      items: 10,
      weightKg: "50",
      volumeM3: "0.5",
      temperature: "chilled",
      reason: "NO_CAPACITY",
      reasonInfo: DEFERRAL_REASON_INFO.NO_CAPACITY,
      reportedAt: "2026-06-02T08:00:00Z",
      status: "DEFERRED",
      orderDate: "2026-06-03",
      submittedAt: null,
    },
  ];

  const csv = exportDeferralsCsv(sample);
  assert.equal(csv.includes("Order ID,Outlet,District,Depot,Brand,Items,Weight (kg)"), true);
  assert.equal(csv.includes('"Outlet, Colombo"'), true);
  assert.equal(csv.includes("NO_CAPACITY"), true);
  assert.equal(csv.includes("No Vehicle Capacity"), true);
  assert.equal(csv.includes("Weight & Volume Capacity"), true);
});
