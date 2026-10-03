import type { OfflineEventType, OfflineLocalState } from "./offline-boundary";
import type { DriverTrip } from "./driver-routes";

const forbiddenLocalKeys = ["password", "passwordHash", "sessionToken", "csrfToken", "cookie", "DATABASE_URL"];

export type CachedRoute = {
  tripId: string;
  cachedAt: string;
  trip: DriverTrip;
};

export type PendingSyncEvent = {
  clientEventId: string;
  eventType: OfflineEventType;
  targetId: string;
  clientCreatedAt: string;
  state: OfflineLocalState;
  attemptCount: number;
  payload: Record<string, unknown>;
};

export type OfflineStore = {
  putRoute(route: CachedRoute): Promise<void>;
  listRoutes(): Promise<CachedRoute[]>;
  clearCompletedRoutes(): Promise<void>;
  putEvent(event: PendingSyncEvent): Promise<void>;
  listEvents(): Promise<PendingSyncEvent[]>;
};

export function createMemoryOfflineStore(): OfflineStore {
  const routes = new Map<string, CachedRoute>();
  const events = new Map<string, PendingSyncEvent>();
  return {
    async putRoute(route) {
      routes.set(route.tripId, route);
    },
    async listRoutes() {
      return [...routes.values()];
    },
    async clearCompletedRoutes() {
      routes.clear();
    },
    async putEvent(event) {
      if (!payloadIsAllowed(event.payload)) {
        throw new Error("offline_payload_rejected");
      }
      events.set(event.clientEventId, event);
    },
    async listEvents() {
      return [...events.values()];
    },
  };
}

const databaseName = "wayloom-offline";

export function openIndexedDbOfflineStore(): Promise<OfflineStore> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onerror = () => reject(request.error ?? new Error("indexeddb_unavailable"));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("routes")) database.createObjectStore("routes", { keyPath: "tripId" });
      if (!database.objectStoreNames.contains("events")) database.createObjectStore("events", { keyPath: "clientEventId" });
    };
    request.onsuccess = () => resolve(indexedDbStore(request.result));
  });
}

function indexedDbStore(database: IDBDatabase): OfflineStore {
  return {
    putRoute: async (route) => {
      await requestToPromise(database, "routes", "readwrite", (store) => store.put(route));
    },
    listRoutes: () => requestToPromise(database, "routes", "readonly", (store) => store.getAll()),
    clearCompletedRoutes: async () => {
      await requestToPromise(database, "routes", "readwrite", (store) => store.clear());
    },
    putEvent: async (event) => {
      if (!payloadIsAllowed(event.payload)) throw new Error("offline_payload_rejected");
      await requestToPromise(database, "events", "readwrite", (store) => store.put(event));
    },
    listEvents: () => requestToPromise(database, "events", "readonly", (store) => store.getAll()),
  };
}

function payloadIsAllowed(value: Record<string, unknown>): boolean {
  return Object.keys(value).every((key) => !forbiddenLocalKeys.includes(key));
}

function requestToPromise<T>(database: IDBDatabase, name: string, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(name, mode);
    const request = work(transaction.objectStore(name));
    request.onerror = () => reject(request.error ?? new Error("indexeddb_request_failed"));
    request.onsuccess = () => resolve(request.result);
  });
}
