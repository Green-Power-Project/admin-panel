'use client';

import { recordChange } from '@/lib/changelog/changeLogStore';
import { createOperationsSnapshot } from './demoData';
import {
  isOpenOrder,
  isOpenTask,
  type MaterialOrderRecord,
  type MaterialOrderStatus,
  type OperationsSnapshot,
  type TaskRecord,
  type TaskStatus,
  type CorrectionRequestRecord,
  type ProjectNoteRecord,
} from './types';

const STORAGE_KEY = 'green-power-operations-demo-v1';

type StoreListener = () => void;

let snapshot: OperationsSnapshot | null = null;
const listeners = new Set<StoreListener>();

function loadSnapshot(): OperationsSnapshot {
  if (snapshot) return snapshot;

  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        snapshot = JSON.parse(raw) as OperationsSnapshot;
        return snapshot;
      }
    } catch (error) {
      console.warn('operations store load failed:', error);
    }
  }

  snapshot = createOperationsSnapshot();
  persist();
  return snapshot;
}

function persist() {
  if (!snapshot || typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.warn('operations store persist failed:', error);
  }
}

function notify() {
  persist();
  listeners.forEach((listener) => listener());
}

export function subscribeOperations(listener: StoreListener): () => void {
  loadSnapshot();
  listeners.add(listener);
  listener();
  return () => listeners.delete(listener);
}

/* ---------------- material orders (requirement 63) ---------------- */

export function getOrders(): MaterialOrderRecord[] {
  return [...loadSnapshot().orders].sort((a, b) =>
    a.requestedDate < b.requestedDate ? 1 : -1,
  );
}

export function setOrderStatus(
  id: string,
  status: MaterialOrderStatus,
): boolean {
  const store = loadSnapshot();
  const order = store.orders.find((o) => o.id === id);
  if (!order) return false;

  recordChange({
    entity: 'materialOrder',
    entityId: id,
    entityLabel: `${order.material} · ${order.projectName}`,
    field: 'status',
    oldValue: order.status,
    newValue: status,
  });

  order.status = status;
  notify();
  return true;
}

export function countNewOrders(): number {
  return loadSnapshot().orders.filter((o) => o.status === 'new').length;
}

export function countOpenOrders(): number {
  return loadSnapshot().orders.filter(isOpenOrder).length;
}

/* ---------------- tasks (requirements 39, 40, 64) ---------------- */

export function getTasks(): TaskRecord[] {
  return [...loadSnapshot().tasks].sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function addTask(input: Omit<TaskRecord, 'id'>): string {
  const store = loadSnapshot();
  const id = `task-${Date.now()}`;
  store.tasks.push({ ...input, id, title: input.title.trim() });
  notify();
  return id;
}

export function setTaskStatus(id: string, status: TaskStatus): boolean {
  const store = loadSnapshot();
  const task = store.tasks.find((t) => t.id === id);
  if (!task) return false;

  recordChange({
    entity: 'task',
    entityId: id,
    entityLabel: task.title,
    field: 'status',
    oldValue: task.status,
    newValue: status,
  });

  task.status = status;
  notify();
  return true;
}

export function deleteTask(id: string): boolean {
  const store = loadSnapshot();
  const before = store.tasks.length;
  store.tasks = store.tasks.filter((t) => t.id !== id);
  if (store.tasks.length === before) return false;
  notify();
  return true;
}

export function countOpenTasks(): number {
  return loadSnapshot().tasks.filter(isOpenTask).length;
}

/** Appointments falling on [isoDate] (requirement 41, dashboard tile 49). */
export function countAppointmentsOn(isoDate: string): number {
  return loadSnapshot().tasks.filter((t) => t.appointment.startsWith(isoDate))
    .length;
}

/** Tasks visible to one employee — mirrors the app's own rule. */
export function tasksForEmployee(employeeId: string): TaskRecord[] {
  return getTasks().filter((t) => t.assignedEmployeeIds.includes(employeeId));
}

/* ---------- corrections and notes (requirements 14, 29, 49) ---------- */

export function getCorrections(): CorrectionRequestRecord[] {
  return [...loadSnapshot().corrections].sort((a, b) =>
    a.requestedAt < b.requestedAt ? 1 : -1,
  );
}

export function countOpenCorrections(): number {
  return loadSnapshot().corrections.filter((c) => !c.resolved).length;
}

export function resolveCorrection(id: string): boolean {
  const store = loadSnapshot();
  const correction = store.corrections.find((c) => c.id === id);
  if (!correction) return false;
  correction.resolved = true;
  notify();
  return true;
}

export function getNotes(): ProjectNoteRecord[] {
  return [...loadSnapshot().notes].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  );
}

export function countNewNotes(): number {
  return loadSnapshot().notes.filter((n) => n.isNew).length;
}
