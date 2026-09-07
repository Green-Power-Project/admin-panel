'use client';

import type { ChangeLogEntity, ChangeLogEntry } from './types';

const STORAGE_KEY = 'green-power-change-log-demo-v1';
const MAX_ENTRIES = 500;

type StoreListener = () => void;

let entries: ChangeLogEntry[] | null = null;
const listeners = new Set<StoreListener>();

/** Who the log attributes changes to while there is no real auth session. */
let currentUser = 'Office';

export function setChangeLogUser(user: string): void {
  if (user.trim()) currentUser = user.trim();
}

function load(): ChangeLogEntry[] {
  if (entries) return entries;

  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        entries = JSON.parse(raw) as ChangeLogEntry[];
        return entries;
      }
    } catch (error) {
      console.warn('change log load failed:', error);
    }
  }

  entries = [];
  return entries;
}

function persist() {
  if (!entries || typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (error) {
    console.warn('change log persist failed:', error);
  }
}

function notify() {
  persist();
  listeners.forEach((listener) => listener());
}

export function subscribeChangeLog(listener: StoreListener): () => void {
  load();
  listeners.add(listener);
  listener();
  return () => listeners.delete(listener);
}

/**
 * Records one change. A no-op when the value did not actually change, so the
 * log stays a record of real edits rather than of every save press.
 */
export function recordChange(input: {
  entity: ChangeLogEntity;
  entityId: string;
  entityLabel: string;
  field: string;
  oldValue: string;
  newValue: string;
  user?: string;
}): boolean {
  if (input.oldValue === input.newValue) return false;

  const store = load();
  store.unshift({
    id: `chg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    entity: input.entity,
    entityId: input.entityId,
    entityLabel: input.entityLabel,
    field: input.field,
    oldValue: input.oldValue,
    newValue: input.newValue,
    user: input.user?.trim() || currentUser,
    at: new Date().toISOString(),
  });

  // Keep the demo log bounded.
  if (store.length > MAX_ENTRIES) store.length = MAX_ENTRIES;

  notify();
  return true;
}

/** Newest first. */
export function getChangeLog(): ChangeLogEntry[] {
  return [...load()];
}

export function getChangeLogFor(
  entity: ChangeLogEntity,
  entityId: string,
): ChangeLogEntry[] {
  return load().filter((e) => e.entity === entity && e.entityId === entityId);
}

export function getChangeLogUsers(): string[] {
  return Array.from(new Set(load().map((e) => e.user))).sort();
}

export function clearChangeLog(): void {
  entries = [];
  notify();
}
