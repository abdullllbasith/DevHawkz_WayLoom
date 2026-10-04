"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { chooseOperationalDate, distinctOrderDates } from "../../lib/dispatcher-operational-date";
import { readOrderList } from "../../lib/dispatcher-orders";

export type OperationalDateStatus = "loading" | "ready" | "empty" | "error";

type OperationalDateValue = {
  status: OperationalDateStatus;
  dates: readonly string[];
  selected: string | null;
  setSelected: (date: string) => void;
};

const OperationalDateContext = createContext<OperationalDateValue | null>(null);

export function OperationalDateProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<OperationalDateStatus>("loading");
  const [dates, setDates] = useState<string[]>([]);
  const [selected, setSelectedState] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);

  function setSelected(date: string) {
    if (!dates.includes(date)) return;
    selectedRef.current = date;
    setSelectedState(date);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/orders", { cache: "no-store" });
        if (!response.ok) throw new Error("orders_unavailable");
        const orders = readOrderList(await response.json());
        const orderDates = distinctOrderDates(orders);
        if (cancelled) return;
        const availableDates = orderDates;
        const next = chooseOperationalDate({ orderDates, availableDates, selected: selectedRef.current });
        selectedRef.current = next;
        setDates(availableDates);
        setSelectedState(next);
        setStatus(availableDates.length === 0 ? "empty" : "ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<OperationalDateValue>(
    () => ({ status, dates, selected, setSelected }),
    [status, dates, selected],
  );

  return <OperationalDateContext.Provider value={value}>{children}</OperationalDateContext.Provider>;
}

export function useOperationalDate(): OperationalDateValue {
  const value = useContext(OperationalDateContext);
  if (value === null) {
    throw new Error("Dispatcher operational date is not available.");
  }
  return value;
}

export const noOperationalDateMessage = "No operational planning date is available.";
export const selectOperationalDateMessage = "Select an operational date.";
