'use client';

import { recordChange } from '@/lib/changelog/changeLogStore';
import { createCatalogSnapshot } from './demoData';
import type {
  CatalogSnapshot,
  MachineCatalogItem,
  MaterialCatalogItem,
} from './types';

const STORAGE_KEY = 'green-power-catalog-demo-v1';

type StoreListener = () => void;

let snapshot: CatalogSnapshot | null = null;
const listeners = new Set<StoreListener>();

function loadSnapshot(): CatalogSnapshot {
  if (snapshot) return snapshot;

  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        snapshot = JSON.parse(raw) as CatalogSnapshot;
        return snapshot;
      }
    } catch (error) {
      console.warn('catalog store load failed:', error);
    }
  }

  snapshot = createCatalogSnapshot();
  persist();
  return snapshot;
}

function persist() {
  if (!snapshot || typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.warn('catalog store persist failed:', error);
  }
}

function notify() {
  persist();
  listeners.forEach((listener) => listener());
}

export function subscribeCatalog(listener: StoreListener): () => void {
  loadSnapshot();
  listeners.add(listener);
  listener();
  return () => listeners.delete(listener);
}

export function resetCatalog(): void {
  snapshot = createCatalogSnapshot();
  notify();
}

/* ---------------- materials (requirement 55) ---------------- */

export function getMaterials(): MaterialCatalogItem[] {
  return [...loadSnapshot().materials].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

/** What the employee app would offer: active entries only. */
export function getActiveMaterials(): MaterialCatalogItem[] {
  return getMaterials().filter((item) => item.isActive);
}

export function addMaterial(
  input: Omit<MaterialCatalogItem, 'id'>,
): string {
  const store = loadSnapshot();
  const id = `mat-${Date.now()}`;
  store.materials.push({ ...input, id, name: input.name.trim() });
  notify();
  return id;
}

export function updateMaterial(
  id: string,
  changes: Partial<Omit<MaterialCatalogItem, 'id'>>,
): boolean {
  const store = loadSnapshot();
  const index = store.materials.findIndex((item) => item.id === id);
  if (index < 0) return false;

  const before = store.materials[index];
  for (const [field, value] of Object.entries(changes)) {
    recordChange({
      entity: 'material',
      entityId: id,
      entityLabel: before.name,
      field,
      oldValue: String(before[field as keyof typeof before] ?? ''),
      newValue: String(value ?? ''),
    });
  }

  store.materials[index] = { ...store.materials[index], ...changes };
  notify();
  return true;
}

export function deleteMaterial(id: string): boolean {
  const store = loadSnapshot();
  const before = store.materials.length;
  store.materials = store.materials.filter((item) => item.id !== id);
  if (store.materials.length === before) return false;
  notify();
  return true;
}

/* ---------------- machines (requirement 56) ---------------- */

export function getMachines(): MachineCatalogItem[] {
  return [...loadSnapshot().machines].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export function getActiveMachines(): MachineCatalogItem[] {
  return getMachines().filter((item) => item.isActive);
}

export function addMachine(input: Omit<MachineCatalogItem, 'id'>): string {
  const store = loadSnapshot();
  const id = `machine-${Date.now()}`;
  store.machines.push({ ...input, id, name: input.name.trim() });
  notify();
  return id;
}

export function updateMachine(
  id: string,
  changes: Partial<Omit<MachineCatalogItem, 'id'>>,
): boolean {
  const store = loadSnapshot();
  const index = store.machines.findIndex((item) => item.id === id);
  if (index < 0) return false;

  const before = store.machines[index];
  for (const [field, value] of Object.entries(changes)) {
    recordChange({
      entity: 'machine',
      entityId: id,
      entityLabel: before.name,
      field,
      oldValue: String(before[field as keyof typeof before] ?? ''),
      newValue: String(value ?? ''),
    });
  }

  store.machines[index] = { ...store.machines[index], ...changes };
  notify();
  return true;
}

export function deleteMachine(id: string): boolean {
  const store = loadSnapshot();
  const before = store.machines.length;
  store.machines = store.machines.filter((item) => item.id !== id);
  if (store.machines.length === before) return false;
  notify();
  return true;
}
