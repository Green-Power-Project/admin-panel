'use client';

import { createDemoSnapshot, type DemoStoreSnapshot } from './demoData';
import type {
  EmployeeAppData,
  EmployeeDocumentRecord,
  EmployeeProjectAssignment,
  EmployeeRecord,
  ProjectOption,
} from './types';

// v2 adds working-time, permissions and document folders.
const STORAGE_KEY = 'green-power-employees-demo-v2';

type StoreListener = () => void;

let snapshot: DemoStoreSnapshot | null = null;
const listeners = new Set<StoreListener>();

function reviveDates(data: DemoStoreSnapshot): DemoStoreSnapshot {
  return {
    ...data,
    employees: data.employees.map((e) => ({
      ...e,
      createdAt: e.createdAt ? new Date(e.createdAt) : undefined,
      updatedAt: e.updatedAt ? new Date(e.updatedAt) : undefined,
    })),
    assignments: data.assignments.map((a) => ({
      ...a,
      assignedAt: a.assignedAt ? new Date(a.assignedAt) : undefined,
    })),
    documents: data.documents.map((d) => ({
      ...d,
      uploadedAt: new Date(d.uploadedAt),
    })),
  };
}

function loadSnapshot(): DemoStoreSnapshot {
  if (snapshot) return snapshot;

  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        snapshot = reviveDates(JSON.parse(raw) as DemoStoreSnapshot);
        return snapshot;
      }
    } catch (error) {
      console.warn('demo store load failed:', error);
    }
  }

  snapshot = createDemoSnapshot();
  persistSnapshot();
  return snapshot;
}

function persistSnapshot() {
  if (!snapshot || typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.warn('demo store persist failed:', error);
  }
}

function notify() {
  persistSnapshot();
  listeners.forEach((listener) => listener());
}

export function subscribeDemoStore(listener: StoreListener): () => void {
  loadSnapshot();
  listeners.add(listener);
  listener();
  return () => listeners.delete(listener);
}

export function resetDemoStore(): void {
  snapshot = createDemoSnapshot();
  notify();
}

export function getDemoEmployees(): EmployeeRecord[] {
  return [...loadSnapshot().employees].sort((a, b) =>
    a.lastName.localeCompare(b.lastName),
  );
}

export function getDemoEmployee(id: string): EmployeeRecord | null {
  return loadSnapshot().employees.find((e) => e.id === id) ?? null;
}

export function getDemoProjects(): ProjectOption[] {
  return [...loadSnapshot().projects];
}

export function getDemoAssignments(employeeId?: string): EmployeeProjectAssignment[] {
  const list = loadSnapshot().assignments;
  return employeeId ? list.filter((a) => a.employeeId === employeeId) : [...list];
}

export function getDemoDocuments(employeeId: string): EmployeeDocumentRecord[] {
  return loadSnapshot()
    .documents.filter((d) => d.employeeId === employeeId)
    .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
}

export function getDemoAppData(employeeId: string): EmployeeAppData {
  const data = loadSnapshot().appData[employeeId];
  if (data) return data;
  return {
    time: [],
    leave: [],
    deliveryNotes: [],
    materials: [],
    documentation: [],
    measurement: [],
    machines: [],
    reports: [],
  };
}

export function createDemoEmployee(
  input: Omit<EmployeeRecord, 'id' | 'createdAt' | 'updatedAt'>,
): string {
  const store = loadSnapshot();
  const id = `demo-emp-${Date.now()}`;
  const now = new Date();
  store.employees.push({
    ...input,
    id,
    assignedProjectIds: input.assignedProjectIds ?? [],
    createdAt: now,
    updatedAt: now,
  });
  store.appData[id] = {
    time: [],
    leave: [],
    deliveryNotes: [],
    materials: [],
    documentation: [],
    measurement: [],
    machines: [],
    reports: [],
  };
  notify();
  return id;
}

export function updateDemoEmployee(
  employeeId: string,
  input: Partial<EmployeeRecord>,
): boolean {
  const store = loadSnapshot();
  const index = store.employees.findIndex((e) => e.id === employeeId);
  if (index < 0) return false;
  const { id: _id, createdAt: _c, ...rest } = input;
  store.employees[index] = {
    ...store.employees[index],
    ...rest,
    id: employeeId,
    updatedAt: new Date(),
  };
  notify();
  return true;
}

export function assignDemoProject(
  employeeId: string,
  project: ProjectOption,
): boolean {
  const store = loadSnapshot();
  if (store.assignments.some((a) => a.employeeId === employeeId && a.projectId === project.id)) {
    return true;
  }
  store.assignments.push({
    id: `demo-asg-${Date.now()}`,
    employeeId,
    projectId: project.id,
    projectName: project.name,
    assignedAt: new Date(),
  });
  const employee = store.employees.find((e) => e.id === employeeId);
  if (employee) {
    const ids = new Set([...employee.assignedProjectIds, project.id]);
    employee.assignedProjectIds = Array.from(ids);
    employee.updatedAt = new Date();
  }
  notify();
  return true;
}

export function removeDemoAssignment(assignmentId: string): boolean {
  const store = loadSnapshot();
  const assignment = store.assignments.find((a) => a.id === assignmentId);
  if (!assignment) return false;
  store.assignments = store.assignments.filter((a) => a.id !== assignmentId);
  const employee = store.employees.find((e) => e.id === assignment.employeeId);
  if (employee) {
    employee.assignedProjectIds = employee.assignedProjectIds.filter(
      (id) => id !== assignment.projectId,
    );
    employee.updatedAt = new Date();
  }
  notify();
  return true;
}

export function addDemoDocument(
  employeeId: string,
  input: {
    name: string;
    category: string;
    fileName: string;
    year?: number;
    visibleToEmployee?: boolean;
  },
): boolean {
  const store = loadSnapshot();
  store.documents.push({
    id: `demo-doc-${Date.now()}`,
    employeeId,
    name: input.name,
    category: input.category,
    year: input.year ?? new Date().getFullYear(),
    // Nothing reaches the employee app until the admin releases it.
    visibleToEmployee: input.visibleToEmployee ?? false,
    fileName: input.fileName,
    uploadedAt: new Date(),
  });
  notify();
  return true;
}

/** Releases a document to the employee app, or takes it back. */
export function setDemoDocumentVisibility(
  employeeId: string,
  documentId: string,
  visibleToEmployee: boolean,
): boolean {
  const store = loadSnapshot();
  const doc = store.documents.find(
    (d) => d.id === documentId && d.employeeId === employeeId,
  );
  if (!doc) return false;
  doc.visibleToEmployee = visibleToEmployee;
  notify();
  return true;
}

export function deleteDemoDocument(employeeId: string, documentId: string): boolean {
  const store = loadSnapshot();
  const before = store.documents.length;
  store.documents = store.documents.filter(
    (d) => !(d.id === documentId && d.employeeId === employeeId),
  );
  if (store.documents.length === before) return false;
  notify();
  return true;
}

export function mergeDemoProjects(firestoreProjects: ProjectOption[]): ProjectOption[] {
  const store = loadSnapshot();
  const byId = new Map<string, ProjectOption>();
  for (const p of store.projects) byId.set(p.id, p);
  for (const p of firestoreProjects) byId.set(p.id, p);
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}
