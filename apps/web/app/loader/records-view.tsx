"use client";

import { useEffect, useMemo, useState } from "react";

import { StatusBanner } from "../status-banner";
import { WAYLOOM_CSRF_HEADER } from "../../lib/api-client";
import { humanActionError, loaderVerifiedMessage } from "../../lib/status-copy";
import { displayRouteLabel, shortId } from "../../lib/short-id";

export type LoadingTask = {
  id: string;
  tripStopId: string;
  expectedUnits: number;
  loadedUnits: number;
  shortfallUnits: number | null;
  verifiedAt: string;
  shortfallReportedAt: string | null;
  details: string | null;
};

export type EligibleStop = {
  tripStopId: string;
  sequence: number;
  plannedArrival: string | null;
  tripId: string;
  routeId: string | null;
  operationalDate: string;
  depot: string;
  tripNumber: number;
  vehicleId: string;
  vehicleType: string;
  vehicleTemp: string;
  weightCapKg: string;
  volumeCapM3: string;
  driverName: string | null;
  orderId: string;
  deliveryId: string;
  outletCode: string;
  district: string;
  brand: string;
  tempRequirement: "chilled" | "ambient";
  expectedUnits: number;
  orderWeightKg: string;
  orderVolumeM3: string;
};

type View = "dashboard" | "loading" | "checklist" | "records";

export function LoaderRecords({ view }: { view: View }) {
  const [tasks, setTasks] = useState<LoadingTask[] | null>(null);
  const [stops, setStops] = useState<EligibleStop[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [loadedUnits, setLoadedUnits] = useState("");
  const [shortfallUnits, setShortfallUnits] = useState("");
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  async function load() {
    const [stopResponse, taskResponse] = await Promise.all([
      fetch("/api/loading/stops", { cache: "no-store" }),
      fetch("/api/loading/tasks", { cache: "no-store" }),
    ]);
    if (stopResponse.status === 401 || stopResponse.status === 403 || taskResponse.status === 401 || taskResponse.status === 403) {
      throw new Error("denied");
    }
    if (!stopResponse.ok || !taskResponse.ok) throw new Error("unavailable");
    const parsedStops = readStops(await stopResponse.json());
    const parsedTasks = readTasks(await taskResponse.json());
    if (parsedStops === null || parsedTasks === null) throw new Error("unavailable");
    setStops(parsedStops);
    setTasks(parsedTasks);
    setError(null);
  }

  useEffect(() => {
    let cancelled = false;
    load()
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error && reason.message === "denied"
            ? "This Loader cannot read this loading work."
            : "Loading work could not be read. This is not an empty assignment.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const stopRows = stops ?? [];
  const records = tasks ?? [];
  const selectedStop = stopRows.find((stop) => stop.tripStopId === selectedStopId) ?? stopRows[0] ?? null;
  const selectedRecord = records.find((task) => task.id === selectedRecordId) ?? records[0] ?? null;
  const expected = useMemo(() => stopRows.reduce((sum, stop) => sum + stop.expectedUnits, 0), [stopRows]);
  const shortfalls = records.filter((task) => task.shortfallUnits !== null && task.shortfallUnits > 0).length;

  async function verify() {
    if (selectedStop === null) return;
    const units = wholeNumber(loadedUnits);
    if (units === null) {
      setMessage("Enter the loaded quantity as a whole number.");
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const response = await postLoading(`/api/loading/${encodeURIComponent(selectedStop.tripStopId)}/verify`, { loadedUnits: units });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(humanActionError(response.status, payload, "verify"));
        return;
      }
      setLoadedUnits("");
      setMessage(loaderVerifiedMessage);
      await load();
    } catch {
      setMessage(humanActionError(0, null, "verify"));
    } finally {
      setPending(false);
    }
  }

  async function reportShortfall() {
    if (selectedRecord === null) return;
    const units = wholeNumber(shortfallUnits);
    if (units === null) {
      setMessage("Enter the shortfall as a whole number.");
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const response = await postLoading(`/api/loading/${encodeURIComponent(selectedRecord.tripStopId)}/shortfall`, {
        shortfallUnits: units,
        ...(details.trim().length > 0 ? { details: details.trim() } : {}),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(humanActionError(response.status, payload, "shortfall"));
        return;
      }
      setShortfallUnits("");
      setDetails("");
      setMessage("The shortfall was recorded.");
      await load();
    } catch {
      setMessage(humanActionError(0, null, "shortfall"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="orders-page-container">
      {error && (
        <StatusBanner
          tone={error.startsWith("This Loader") ? "denied" : "error"}
          title={error.startsWith("This Loader") ? "Loading work is not available" : "Loading work is unavailable"}
          body={error}
          action={<button type="button" className="btn-primary loader-touch" onClick={() => { setError(null); setStops(null); setTasks(null); setReloadKey((value) => value + 1); }}>Retry</button>}
        />
      )}
      {message && <StatusBanner tone={message === loaderVerifiedMessage || message === "The shortfall was recorded." ? "success" : "info"} title={message === loaderVerifiedMessage ? "Verification recorded" : "Loading update"} body={message} />}
      {stops === null && error === null ? <StatusBanner tone="loading" title="Reading loading work" body="Counts stay hidden until the server responds." /> : null}
      {stops !== null && view === "dashboard" ? (
        <StatusBanner
          tone={stopRows.length === 0 ? "empty" : "info"}
          title={stopRows.length === 0 ? "Nothing is waiting" : "Waiting work"}
          body={stopRows.length === 0 ? "Confirmed allocated stops appear on Loading." : "Open Loading to verify the next stop."}
        />
      ) : null}
      {stops !== null && view === "loading" && stopRows.length === 0 ? (
        <StatusBanner tone="empty" title="No confirmed stop is waiting for loading" body="A stop appears here after the Dispatcher confirms a plan and before this Loader verifies it." />
      ) : null}
      {stops !== null && view === "checklist" ? (
        <StatusBanner
          tone={records.length === 0 ? "empty" : "info"}
          title={records.length === 0 ? "No loading record has been verified for this account" : "Expected versus loaded"}
          body={records.length === 0 ? "Checklist rows appear after verification." : "These quantities come from records this Loader verified."}
        />
      ) : null}
      {stops !== null && view === "records" ? (
        <StatusBanner
          tone={records.length === 0 ? "empty" : "info"}
          title={records.length === 0 ? "No loading records yet" : "Verified records"}
          body={records.length === 0 ? "A record is created when verification succeeds." : "Select a record to report a shortfall if one is still open."}
        />
      ) : null}
      <section className="loader-kpi-grid" aria-label="Loading work summary">
        <Kpi label="Stops to load" value={stops === null ? "—" : String(stopRows.length)} note="Confirmed and not yet verified" />
        <Kpi label="Expected units" value={stops === null ? "—" : String(expected)} note="Order units on those stops" />
        <Kpi label="Verified records" value={tasks === null ? "—" : String(records.length)} note="Created by this Loader" />
        <Kpi label="Shortfalls" value={tasks === null ? "—" : String(shortfalls)} note="Records with a shortfall" />
      </section>
      {view === "records" || view === "checklist" ? (
        <RecordPanel view={view} records={records} selectedId={selectedRecord?.id ?? null} onSelect={setSelectedRecordId} />
      ) : (
        <StopPanel stops={stopRows} selectedId={selectedStop?.tripStopId ?? null} onSelect={setSelectedStopId} />
      )}
      {view === "loading" && selectedStop !== null && (
        <section className="dashboard-card loader-form">
          <h2 className="selected-orders-title">Verify loaded quantity</h2>
          <p className="kpi-subtitle">Stop {selectedStop.sequence + 1} · {selectedStop.outletCode} · expected {selectedStop.expectedUnits}</p>
          <label className="loader-field">
            Loaded units
            <input value={loadedUnits} onChange={(event) => setLoadedUnits(event.target.value)} inputMode="numeric" />
          </label>
          <button type="button" className="btn-primary loader-touch" onClick={() => void verify()} disabled={pending}>
            {pending ? "Saving..." : "Verify loading"}
          </button>
        </section>
      )}
      {view === "records" && selectedRecord !== null && selectedRecord.shortfallUnits === null && (
        <section className="dashboard-card loader-form">
          <h2 className="selected-orders-title">Report shortfall</h2>
          <p className="kpi-subtitle">Expected {selectedRecord.expectedUnits} · loaded {selectedRecord.loadedUnits}</p>
          <label className="loader-field">
            Shortfall units
            <input value={shortfallUnits} onChange={(event) => setShortfallUnits(event.target.value)} inputMode="numeric" />
          </label>
          <label className="loader-field">
            Details
            <textarea value={details} onChange={(event) => setDetails(event.target.value)} rows={3} />
          </label>
          <button type="button" className="btn-primary loader-touch" onClick={() => void reportShortfall()} disabled={pending}>
            {pending ? "Saving..." : "Report shortfall"}
          </button>
        </section>
      )}
    </div>
  );
}

function StopPanel({ stops, selectedId, onSelect }: { stops: EligibleStop[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const selected = stops.find((stop) => stop.tripStopId === selectedId) ?? null;
  return (
    <section className="orders-middle-grid" aria-label="Stops waiting for loading">
      <div className="dashboard-card orders-table-card">
        <div className="orders-card-header">
          <div>
            <h2 className="selected-orders-title">Stops to load</h2>
            <p className="kpi-subtitle">Confirmed stops whose order is still allocated. The sequence is the server sequence.</p>
          </div>
        </div>
        <div className="orders-table-wrapper">
          <table className="orders-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Outlet</th>
                <th>Vehicle</th>
                <th>Expected</th>
                <th>Temperature</th>
              </tr>
            </thead>
            <tbody>
              {stops.length === 0 ? (
                <tr><td colSpan={5} className="empty-table-cell">No confirmed stop is waiting for loading.</td></tr>
              ) : stops.map((stop) => (
                <tr key={stop.tripStopId} className={stop.tripStopId === selectedId ? "loader-row-selected" : undefined}>
                  <td>{stop.sequence + 1}</td>
                  <td>
                    <button type="button" className="cell-id-btn" onClick={() => onSelect(stop.tripStopId)}>
                      {stop.outletCode}
                    </button>
                    <div className="kpi-subtitle">{stop.district}</div>
                  </td>
                  <td>{stop.vehicleType}<div className="kpi-subtitle" title={stop.vehicleId}>{shortId(stop.vehicleId)}</div></td>
                  <td>{stop.expectedUnits}</td>
                  <td>{stop.tempRequirement}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <aside className="dashboard-card order-insights-card">
        <h2 className="insights-card-title">Selected stop</h2>
        {selected === null ? <p className="insight-text">Select a stop to see the vehicle and order.</p> : (
          <div className="order-insights-list">
            <p className="insight-text" title={selected.vehicleId}>Vehicle {shortId(selected.vehicleId)} · {selected.vehicleType} · {selected.vehicleTemp}</p>
            <p className="insight-text">Capacity {selected.weightCapKg} kg · {selected.volumeCapM3} m3</p>
            <p className="insight-text">Driver {selected.driverName ?? "—"}</p>
            <p className="insight-text">Depot {selected.depot} · trip {selected.tripNumber} · {selected.operationalDate}</p>
            <p className="insight-text">Route {displayRouteLabel({ routeId: selected.routeId, tripNumber: selected.tripNumber })}</p>
            <p className="insight-text" title={selected.deliveryId}>Order {shortId(selected.deliveryId)} · {selected.brand}</p>
            <p className="insight-text">Expected {selected.expectedUnits} · {selected.orderWeightKg} kg</p>
            <p className="insight-text">Planned arrival {selected.plannedArrival ?? "—"}</p>
          </div>
        )}
      </aside>
    </section>
  );
}

function RecordPanel({
  view,
  records,
  selectedId,
  onSelect,
}: {
  view: "checklist" | "records";
  records: LoadingTask[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="dashboard-card orders-table-card" aria-label={view === "checklist" ? "Verified quantities" : "Loading records"}>
      <div className="orders-card-header">
        <div>
          <h2 className="selected-orders-title">{view === "checklist" ? "Verified quantities" : "Loading records"}</h2>
          <p className="kpi-subtitle">
            {view === "checklist"
              ? "Each row compares loaded units with the expected units stored when the stop was verified."
              : "A shortfall stays on the loading record and does not change the order quantity."}
          </p>
        </div>
      </div>
      <div className="orders-table-wrapper">
        <table className="orders-table">
          <thead>
            <tr>
              <th>Stop</th>
              <th>Expected</th>
              <th>Loaded</th>
              <th>Shortfall</th>
              <th>Verified</th>
              {view === "records" ? <th>Details</th> : null}
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr><td colSpan={view === "records" ? 6 : 5} className="empty-table-cell">No loading record has been verified for this account.</td></tr>
            ) : records.map((task) => (
              <tr key={task.id} className={task.id === selectedId ? "loader-row-selected" : undefined}>
                <td><button type="button" className="cell-id-btn loader-stop-id" title={task.tripStopId} onClick={() => onSelect(task.id)}>{shortId(task.tripStopId)}</button></td>
                <td>{task.expectedUnits}</td>
                <td>{task.loadedUnits}</td>
                <td>{task.shortfallUnits === null ? "—" : task.shortfallUnits}</td>
                <td>{formatWhen(task.verifiedAt)}</td>
                {view === "records" ? <td>{task.details && task.details.length > 0 ? task.details : "—"}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-subtitle">{note}</div>
    </div>
  );
}

async function postLoading(path: string, body: unknown): Promise<Response> {
  const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
  const csrfBody: unknown = csrfResponse.ok ? await csrfResponse.json() : null;
  const token = typeof csrfBody === "object" && csrfBody !== null && "csrfToken" in csrfBody && typeof csrfBody.csrfToken === "string" ? csrfBody.csrfToken : "";
  return fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", [WAYLOOM_CSRF_HEADER]: token },
    body: JSON.stringify(body),
  });
}

function wholeNumber(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  return Number(value.trim());
}

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Colombo" }).format(date);
}

function readStops(value: unknown): EligibleStop[] | null {
  if (!Array.isArray(value)) return null;
  const stops: EligibleStop[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) return null;
    const record = item as Record<string, unknown>;
    if (typeof record.tripStopId !== "string" || typeof record.sequence !== "number") return null;
    if (typeof record.tripId !== "string" || typeof record.operationalDate !== "string") return null;
    if (typeof record.depot !== "string" || typeof record.tripNumber !== "number") return null;
    if (typeof record.vehicleId !== "string" || typeof record.expectedUnits !== "number") return null;
    if (record.tempRequirement !== "chilled" && record.tempRequirement !== "ambient") return null;
    stops.push({
      tripStopId: record.tripStopId,
      sequence: record.sequence,
      plannedArrival: typeof record.plannedArrival === "string" ? record.plannedArrival : null,
      tripId: record.tripId,
      routeId: typeof record.routeId === "string" ? record.routeId : null,
      operationalDate: record.operationalDate,
      depot: record.depot,
      tripNumber: record.tripNumber,
      vehicleId: record.vehicleId,
      vehicleType: typeof record.vehicleType === "string" ? record.vehicleType : "—",
      vehicleTemp: typeof record.vehicleTemp === "string" ? record.vehicleTemp : "—",
      weightCapKg: typeof record.weightCapKg === "string" ? record.weightCapKg : "—",
      volumeCapM3: typeof record.volumeCapM3 === "string" ? record.volumeCapM3 : "—",
      driverName: typeof record.driverName === "string" ? record.driverName : null,
      orderId: typeof record.orderId === "string" ? record.orderId : "—",
      deliveryId: typeof record.deliveryId === "string" ? record.deliveryId : "—",
      outletCode: typeof record.outletCode === "string" ? record.outletCode : "—",
      district: typeof record.district === "string" ? record.district : "—",
      brand: typeof record.brand === "string" ? record.brand : "—",
      tempRequirement: record.tempRequirement,
      expectedUnits: record.expectedUnits,
      orderWeightKg: typeof record.orderWeightKg === "string" ? record.orderWeightKg : "—",
      orderVolumeM3: typeof record.orderVolumeM3 === "string" ? record.orderVolumeM3 : "—",
    });
  }
  return stops;
}

function readTasks(value: unknown): LoadingTask[] | null {
  if (!Array.isArray(value)) return null;
  const tasks: LoadingTask[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) return null;
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.tripStopId !== "string") return null;
    if (typeof record.expectedUnits !== "number" || typeof record.loadedUnits !== "number") return null;
    if (typeof record.verifiedAt !== "string") return null;
    tasks.push({
      id: record.id,
      tripStopId: record.tripStopId,
      expectedUnits: record.expectedUnits,
      loadedUnits: record.loadedUnits,
      shortfallUnits: typeof record.shortfallUnits === "number" ? record.shortfallUnits : null,
      verifiedAt: record.verifiedAt,
      shortfallReportedAt: typeof record.shortfallReportedAt === "string" ? record.shortfallReportedAt : null,
      details: typeof record.details === "string" ? record.details : null,
    });
  }
  return tasks;
}
