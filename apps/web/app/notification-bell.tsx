"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";

import {
  dispatcherNotices,
  driverNotices,
  loaderNotices,
  storeNotices,
  unreadNotices,
  type InboxNotice,
} from "../lib/notifications";
import "./notification-bell.css";

type NoticeRole = "dispatcher" | "store" | "loader" | "driver";

export function NotificationBell({ role }: { role: NoticeRole }) {
  const panelId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const seenRef = useRef<Set<string> | null>(null);
  const [items, setItems] = useState<InboxNotice[]>([]);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const storageKey = `wayloom-seen-notices:${role}`;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const next = await loadNotices(role);
      if (cancelled || next === null) return;
      setItems(next);
      if (seenRef.current !== null) return;
      const stored = readSeen(storageKey) ?? new Set<string>();
      seenRef.current = stored;
      setSeen(new Set(stored));
    }
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [role, storageKey]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (wrapRef.current && event.target instanceof Node && !wrapRef.current.contains(event.target)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unread = unreadNotices(items, seen);

  function toggle() {
    setOpen((current) => {
      const next = !current;
      if (next) markSeen(items);
      return next;
    });
  }

  function markSeen(current: readonly InboxNotice[]) {
    const next = new Set(seenRef.current ?? seen);
    for (const item of current) next.add(item.id);
    seenRef.current = next;
    writeSeen(storageKey, next);
    setSeen(new Set(next));
  }

  const label = unread.length === 0 ? "Notifications" : `Notifications, ${unread.length} unread`;

  return (
    <div className="notification-bell-wrap" ref={wrapRef}>
      <button type="button" className="notification-bell" aria-label={label} aria-expanded={open} aria-controls={panelId} onClick={toggle}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread.length > 0 ? <span className="notification-badge">{unread.length > 9 ? "9+" : unread.length}</span> : null}
      </button>
      {open ? (
        <div className="notification-panel" id={panelId} role="dialog" aria-label="Notifications">
          <h2>Notifications</h2>
          {items.length === 0 ? (
            <p className="notification-empty">No notifications.</p>
          ) : (
            <ul className="notification-list">
              {items.map((item) => (
                <li key={item.id} className={seen.has(item.id) ? "notification-item" : "notification-item is-unread"}>
                  <Link href={item.href} onClick={() => setOpen(false)}>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

async function loadNotices(role: NoticeRole): Promise<InboxNotice[] | null> {
  if (role === "dispatcher") {
    const [orders, exceptions] = await Promise.all([fetchJson("/api/orders"), fetchJson("/api/exceptions")]);
    if (orders === undefined && exceptions === undefined) return null;
    return dispatcherNotices(orders ?? [], exceptions ?? []);
  }
  if (role === "store") {
    const orders = await fetchJson("/api/orders");
    return orders === undefined ? null : storeNotices(orders);
  }
  if (role === "loader") {
    const stops = await fetchJson("/api/loading/stops");
    return stops === undefined ? null : loaderNotices(stops);
  }
  const trips = await fetchJson("/api/driver/routes");
  return trips === undefined ? null : driverNotices(trips);
}

async function fetchJson(url: string): Promise<unknown | undefined> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return undefined;
    return await response.json();
  } catch {
    return undefined;
  }
}

function readSeen(key: string): Set<string> | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return new Set();
  }
}

function writeSeen(key: string, ids: ReadonlySet<string>) {
  try {
    window.localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    // The inbox still works for this visit when storage is blocked.
  }
}
