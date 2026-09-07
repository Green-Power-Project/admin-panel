'use client';

import { recordChange } from '@/lib/changelog/changeLogStore';
import type { LvPositionRecord, LvSnapshot } from './types';
import { parseLvCsv } from './types';

const STORAGE_KEY = 'green-power-lv-demo-v1';

type StoreListener = () => void;

let snapshot: LvSnapshot | null = null;
const listeners = new Set<StoreListener>();

function seed(): LvSnapshot {
  const positions: LvPositionRecord[] = [
    { id: 'lv-01-01', projectId: 'demo-proj-001', code: '01.01', title: 'Baustelle einrichten', description: 'Einrichten und Räumen', unit: 'psch', unitPrice: null, isActive: true },
    { id: 'lv-01-02', projectId: 'demo-proj-001', code: '01.02', title: 'Aushub', description: 'Bodenaushub bis 1,5 m', unit: 'm³', unitPrice: null, isActive: true },
    { id: 'lv-01-03', projectId: 'demo-proj-001', code: '01.03', title: 'Frostschutzschicht', description: 'Schotter 0/45, verdichtet', unit: 'm²', unitPrice: null, isActive: true },
    { id: 'lv-02-01', projectId: 'demo-proj-001', code: '02.01', title: 'Pflasterarbeiten', description: 'Betonpflaster verlegen', unit: 'm²', unitPrice: null, isActive: true },
    { id: 'lv-02-02', projectId: 'demo-proj-001', code: '02.02', title: 'Bordsteine setzen', description: 'Tiefbord in Beton', unit: 'lfdm', unitPrice: null, isActive: true },
  ];

  return {
    positionsByProject: { 'demo-proj-001': positions },
    sourceFileByProject: { 'demo-proj-001': 'LV_Musterstrasse.csv' },
  };
}

function loadSnapshot(): LvSnapshot {
  if (snapshot) return snapshot;

  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        snapshot = JSON.parse(raw) as LvSnapshot;
        return snapshot;
      }
    } catch (error) {
      console.warn('lv store load failed:', error);
    }
  }

  snapshot = seed();
  persist();
  return snapshot;
}

function persist() {
  if (!snapshot || typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.warn('lv store persist failed:', error);
  }
}

function notify() {
  persist();
  listeners.forEach((listener) => listener());
}

export function subscribeLv(listener: StoreListener): () => void {
  loadSnapshot();
  listeners.add(listener);
  listener();
  return () => listeners.delete(listener);
}

export function getLvPositions(projectId: string): LvPositionRecord[] {
  const list = loadSnapshot().positionsByProject[projectId] ?? [];
  return [...list].sort((a, b) => a.code.localeCompare(b.code));
}

/** What the employee app receives: active positions, never the price. */
export function getEmployeeVisiblePositions(
  projectId: string,
): Array<Pick<LvPositionRecord, 'id' | 'code' | 'title' | 'description' | 'unit'>> {
  return getLvPositions(projectId)
    .filter((p) => p.isActive)
    .map(({ id, code, title, description, unit }) => ({
      id,
      code,
      title,
      description,
      unit,
    }));
}

export function getLvSourceFile(projectId: string): string {
  return loadSnapshot().sourceFileByProject[projectId] ?? '';
}

export function addLvPosition(
  input: Omit<LvPositionRecord, 'id'>,
): string {
  const store = loadSnapshot();
  const id = `lv-${Date.now()}`;
  const list = store.positionsByProject[input.projectId] ?? [];
  store.positionsByProject[input.projectId] = [...list, { ...input, id }];
  notify();
  return id;
}

export function updateLvPosition(
  projectId: string,
  id: string,
  changes: Partial<Omit<LvPositionRecord, 'id' | 'projectId'>>,
): boolean {
  const store = loadSnapshot();
  const list = store.positionsByProject[projectId] ?? [];
  const index = list.findIndex((p) => p.id === id);
  if (index < 0) return false;

  const before = list[index];
  for (const [field, value] of Object.entries(changes)) {
    recordChange({
      entity: 'lvPosition',
      entityId: id,
      entityLabel: `${before.code} ${before.title}`.trim(),
      field,
      oldValue: String(before[field as keyof typeof before] ?? ''),
      newValue: String(value ?? ''),
    });
  }

  list[index] = { ...list[index], ...changes };
  store.positionsByProject[projectId] = [...list];
  notify();
  return true;
}

export function deleteLvPosition(projectId: string, id: string): boolean {
  const store = loadSnapshot();
  const list = store.positionsByProject[projectId] ?? [];
  const next = list.filter((p) => p.id !== id);
  if (next.length === list.length) return false;
  store.positionsByProject[projectId] = next;
  notify();
  return true;
}

/** Replaces the project's LV with an imported file (requirement 59). */
export function importLvCsv(
  projectId: string,
  fileName: string,
  content: string,
) {
  const { positions, result } = parseLvCsv(content, projectId);
  if (positions.length === 0) return result;

  const store = loadSnapshot();
  store.positionsByProject[projectId] = positions.map((p, i) => ({
    ...p,
    id: `lv-${Date.now()}-${i}`,
  }));
  store.sourceFileByProject[projectId] = fileName;
  notify();
  return result;
}
