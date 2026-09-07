import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  addDemoDocument,
  assignDemoProject,
  createDemoEmployee,
  deleteDemoDocument,
  setDemoDocumentVisibility,
  getDemoAppData,
  getDemoAssignments,
  getDemoDocuments,
  getDemoEmployee,
  getDemoEmployees,
  getDemoProjects,
  mergeDemoProjects,
  removeDemoAssignment,
  subscribeDemoStore,
  updateDemoEmployee,
} from './demoStore';
import { isEmployeesDemoMode } from './isDemoMode';
import type {
  EmployeeActivityItem,
  EmployeeActivityType,
  EmployeeAppData,
  EmployeeDocumentRecord,
  EmployeeListItem,
  EmployeeProjectAssignment,
  EmployeeRecord,
  ProjectOption,
} from './types';
import {
  DEFAULT_PERMISSIONS,
  DEFAULT_WORKING_TIME_MODELS,
  workingTimeFromModel,
} from './types';

const EMPLOYEES_COLLECTION = 'employees';
const ASSIGNMENTS_COLLECTION = 'employeeProjectAssignments';

function mapEmployee(id: string, data: Record<string, unknown>): EmployeeRecord {
  return {
    id,
    employeeNumber: String(data.employeeNumber ?? ''),
    firstName: String(data.firstName ?? ''),
    lastName: String(data.lastName ?? ''),
    email: String(data.email ?? ''),
    phone: String(data.phone ?? ''),
    role: (data.role as EmployeeRecord['role']) ?? 'employee',
    status: data.status === 'inactive' ? 'inactive' : 'active',
    appAccessEnabled: data.appAccessEnabled !== false,
    language: data.language === 'en' ? 'en' : 'de',
    jobTitle: String(data.jobTitle ?? ''),
    department: String(data.department ?? ''),
    startDate: String(data.startDate ?? ''),
    endDate: String(data.endDate ?? ''),
    notes: String(data.notes ?? ''),
    workingTime:
      (data.workingTime as EmployeeRecord['workingTime']) ??
      workingTimeFromModel(DEFAULT_WORKING_TIME_MODELS[0]),
    permissions: {
      ...DEFAULT_PERMISSIONS,
      ...((data.permissions as Partial<EmployeeRecord['permissions']>) ?? {}),
    },
    assignedProjectIds: Array.isArray(data.assignedProjectIds)
      ? (data.assignedProjectIds as string[])
      : [],
    createdAt:
      data.createdAt instanceof Timestamp ? data.createdAt.toDate() : undefined,
    updatedAt:
      data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : undefined,
  };
}

export function subscribeEmployees(
  onData: (employees: EmployeeRecord[]) => void,
  onError: () => void,
): () => void {
  if (isEmployeesDemoMode()) {
    return subscribeDemoStore(() => onData(getDemoEmployees()));
  }

  if (!db) {
    onData([]);
    return () => {};
  }

  const q = query(collection(db, EMPLOYEES_COLLECTION), orderBy('lastName', 'asc'));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => mapEmployee(d.id, d.data()));
      onData(list);
    },
    (error) => {
      console.error('employees listener:', error);
      onData([]);
      onError();
    },
  );
}

export function subscribeEmployee(
  employeeId: string,
  onData: (employee: EmployeeRecord | null) => void,
  onError: () => void,
): () => void {
  if (isEmployeesDemoMode()) {
    return subscribeDemoStore(() => onData(getDemoEmployee(employeeId)));
  }

  if (!db || !employeeId) {
    onData(null);
    return () => {};
  }

  const ref = doc(db, EMPLOYEES_COLLECTION, employeeId);
  return onSnapshot(
    ref,
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null);
        return;
      }
      onData(mapEmployee(snapshot.id, snapshot.data()));
    },
    (error) => {
      console.error('employee listener:', error);
      onData(null);
      onError();
    },
  );
}

export function subscribeProjects(onData: (projects: ProjectOption[]) => void): () => void {
  if (isEmployeesDemoMode()) {
    const emit = () => onData(getDemoProjects());
    if (!db) {
      return subscribeDemoStore(emit);
    }
    const q = query(collection(db, 'projects'), orderBy('name', 'asc'));
    return onSnapshot(
      q,
      (snapshot) => {
        const firestoreProjects = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: String(data.name ?? ''),
            projectNumber: data.projectNumber ? String(data.projectNumber) : undefined,
          };
        });
        onData(mergeDemoProjects(firestoreProjects));
      },
      () => onData(getDemoProjects()),
    );
  }

  if (!db) {
    onData([]);
    return () => {};
  }

  const q = query(collection(db, 'projects'), orderBy('name', 'asc'));
  return onSnapshot(
    q,
    (snapshot) => {
      onData(
        snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: String(data.name ?? ''),
            projectNumber: data.projectNumber ? String(data.projectNumber) : undefined,
          };
        }),
      );
    },
    (error) => {
      console.error('projects listener:', error);
      onData([]);
    },
  );
}

export function subscribeEmployeeAssignments(
  employeeId: string,
  onData: (assignments: EmployeeProjectAssignment[]) => void,
): () => void {
  if (isEmployeesDemoMode()) {
    return subscribeDemoStore(() => onData(getDemoAssignments(employeeId)));
  }

  if (!db || !employeeId) {
    onData([]);
    return () => {};
  }

  const q = query(
    collection(db, ASSIGNMENTS_COLLECTION),
    where('employeeId', '==', employeeId),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      onData(
        snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            employeeId: String(data.employeeId ?? employeeId),
            projectId: String(data.projectId ?? ''),
            projectName: String(data.projectName ?? ''),
            assignedAt:
              data.assignedAt instanceof Timestamp
                ? data.assignedAt.toDate()
                : undefined,
          };
        }),
      );
    },
    (error) => {
      console.error('assignments listener:', error);
      onData([]);
    },
  );
}

export function subscribeEmployeeDocuments(
  employeeId: string,
  onData: (documents: EmployeeDocumentRecord[]) => void,
): () => void {
  if (isEmployeesDemoMode()) {
    return subscribeDemoStore(() => onData(getDemoDocuments(employeeId)));
  }

  if (!db || !employeeId) {
    onData([]);
    return () => {};
  }

  const q = query(
    collection(db, EMPLOYEES_COLLECTION, employeeId, 'documents'),
    orderBy('uploadedAt', 'desc'),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      onData(
        snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            employeeId,
            name: String(data.name ?? ''),
            category: String(data.category ?? ''),
            year: Number(data.year ?? new Date().getFullYear()),
            visibleToEmployee: data.visibleToEmployee === true,
            fileName: String(data.fileName ?? ''),
            uploadedAt:
              data.uploadedAt instanceof Timestamp
                ? data.uploadedAt.toDate()
                : new Date(),
          };
        }),
      );
    },
    (error) => {
      console.error('employee documents listener:', error);
      onData([]);
    },
  );
}

export function subscribeEmployeeAppData(
  employeeId: string,
  onData: (data: EmployeeAppData) => void,
): () => void {
  if (isEmployeesDemoMode()) {
    return subscribeDemoStore(() => onData(getDemoAppData(employeeId)));
  }

  onData({
    time: [],
    leave: [],
    deliveryNotes: [],
    materials: [],
    documentation: [],
    measurement: [],
    machines: [],
    reports: [],
  });
  return () => {};
}

export function getEmployeeActivityItems(employeeId: string): EmployeeActivityItem[] {
  if (!isEmployeesDemoMode()) return [];

  const data = getDemoAppData(employeeId);
  const items: EmployeeActivityItem[] = [];

  for (const entry of data.time) {
    items.push({
      id: entry.id,
      type: 'time',
      title:
        entry.entryType === 'report'
          ? `Report time: ${entry.hours}h`
          : `Working time: ${entry.hours}h`,
      projectName: entry.projectName,
      date: new Date(entry.date),
      summary: entry.note,
    });
  }
  for (const entry of data.leave) {
    items.push({
      id: entry.id,
      type: 'leave',
      title: `${entry.leaveType} (${entry.days} days)`,
      projectName: '—',
      date: new Date(entry.from),
      summary: `Status: ${entry.status}`,
    });
  }
  for (const entry of data.deliveryNotes) {
    items.push({
      id: entry.id,
      type: 'deliveryNotes',
      title: entry.number,
      projectName: entry.projectName,
      date: new Date(entry.date),
      summary: `${entry.supplier} · ${entry.lineCount} lines · ${entry.status}`,
    });
  }
  for (const entry of data.materials) {
    items.push({
      id: entry.id,
      type: 'materials',
      title: entry.material,
      projectName: entry.projectName,
      date: new Date(),
      summary: `Delivered ${entry.delivered} · Installed ${entry.installed} · Remaining ${entry.remaining} ${entry.unit}`,
    });
  }
  for (const entry of data.documentation) {
    items.push({
      id: entry.id,
      type: 'documentation',
      title: entry.title,
      projectName: entry.projectName,
      date: new Date(entry.date),
      summary: `${entry.photoCount} photos`,
    });
  }
  for (const entry of data.measurement) {
    items.push({
      id: entry.id,
      type: 'measurement',
      title: entry.position,
      projectName: entry.projectName,
      date: new Date(entry.date),
      summary: `Completed ${entry.completed} · Remaining ${entry.remaining} ${entry.unit}`,
    });
  }
  for (const entry of data.machines) {
    items.push({
      id: entry.id,
      type: 'machines',
      title: entry.machine,
      projectName: entry.projectName,
      date: new Date(entry.date),
      summary: `${entry.hours} hours`,
    });
  }
  for (const entry of data.reports) {
    items.push({
      id: entry.id,
      type: 'reports',
      title: entry.title,
      projectName: entry.projectName,
      date: new Date(entry.date),
      summary: entry.status,
    });
  }

  return items.sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function enrichEmployeesWithProjects(
  employees: EmployeeRecord[],
  assignments: EmployeeProjectAssignment[],
): EmployeeListItem[] {
  const countByEmployee = new Map<string, number>();
  for (const a of assignments) {
    countByEmployee.set(a.employeeId, (countByEmployee.get(a.employeeId) ?? 0) + 1);
  }

  return employees.map((e) => ({
    ...e,
    assignedProjectCount:
      countByEmployee.get(e.id) ?? e.assignedProjectIds.length ?? 0,
  }));
}

export async function loadAllAssignments(): Promise<EmployeeProjectAssignment[]> {
  if (isEmployeesDemoMode()) {
    return getDemoAssignments();
  }

  if (!db) return [];
  try {
    const snapshot = await getDocs(collection(db, ASSIGNMENTS_COLLECTION));
    return snapshot.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        employeeId: String(data.employeeId ?? ''),
        projectId: String(data.projectId ?? ''),
        projectName: String(data.projectName ?? ''),
        assignedAt:
          data.assignedAt instanceof Timestamp ? data.assignedAt.toDate() : undefined,
      };
    });
  } catch (error) {
    console.error('load assignments:', error);
    return [];
  }
}

export async function createEmployee(
  input: Omit<EmployeeRecord, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<string | null> {
  if (isEmployeesDemoMode()) {
    return createDemoEmployee(input);
  }

  if (!db) return null;
  try {
    const ref = doc(collection(db, EMPLOYEES_COLLECTION));
    const now = Timestamp.now();
    await setDoc(ref, {
      ...input,
      createdAt: now,
      updatedAt: now,
    });
    return ref.id;
  } catch (error) {
    console.error('create employee:', error);
    return null;
  }
}

export async function updateEmployee(
  employeeId: string,
  input: Partial<EmployeeRecord>,
): Promise<boolean> {
  if (isEmployeesDemoMode()) {
    return updateDemoEmployee(employeeId, input);
  }

  if (!db) return false;
  try {
    const { id: _id, createdAt: _c, ...rest } = input;
    await updateDoc(doc(db, EMPLOYEES_COLLECTION, employeeId), {
      ...rest,
      updatedAt: Timestamp.now(),
    });
    return true;
  } catch (error) {
    console.error('update employee:', error);
    return false;
  }
}

export async function assignProjectToEmployee(
  employeeId: string,
  project: ProjectOption,
): Promise<boolean> {
  if (isEmployeesDemoMode()) {
    return assignDemoProject(employeeId, project);
  }

  if (!db) return false;
  try {
    await addDoc(collection(db, ASSIGNMENTS_COLLECTION), {
      employeeId,
      projectId: project.id,
      projectName: project.name,
      assignedAt: Timestamp.now(),
    });
    const employeeRef = doc(db, EMPLOYEES_COLLECTION, employeeId);
    const snap = await getDoc(employeeRef);
    if (snap.exists()) {
      const current = mapEmployee(snap.id, snap.data());
      const ids = new Set([...current.assignedProjectIds, project.id]);
      await updateDoc(employeeRef, {
        assignedProjectIds: Array.from(ids),
        updatedAt: Timestamp.now(),
      });
    }
    return true;
  } catch (error) {
    console.error('assign project:', error);
    return false;
  }
}

export async function removeProjectAssignment(assignmentId: string): Promise<boolean> {
  if (isEmployeesDemoMode()) {
    return removeDemoAssignment(assignmentId);
  }

  if (!db) return false;
  try {
    await deleteDoc(doc(db, ASSIGNMENTS_COLLECTION, assignmentId));
    return true;
  } catch (error) {
    console.error('remove assignment:', error);
    return false;
  }
}

export async function addEmployeeDocument(
  employeeId: string,
  docInput: {
    name: string;
    category: string;
    fileName: string;
    year: number;
    visibleToEmployee: boolean;
  },
): Promise<boolean> {
  if (isEmployeesDemoMode()) {
    return addDemoDocument(employeeId, docInput);
  }

  if (!db) return false;
  try {
    await addDoc(collection(db, EMPLOYEES_COLLECTION, employeeId, 'documents'), {
      ...docInput,
      uploadedAt: Timestamp.now(),
    });
    return true;
  } catch (error) {
    console.error('add document:', error);
    return false;
  }
}

/** Releases a personal document to the employee app, or takes it back. */
export async function setEmployeeDocumentVisibility(
  employeeId: string,
  documentId: string,
  visibleToEmployee: boolean,
): Promise<boolean> {
  if (isEmployeesDemoMode()) {
    return setDemoDocumentVisibility(employeeId, documentId, visibleToEmployee);
  }

  if (!db) return false;
  try {
    await updateDoc(
      doc(db, EMPLOYEES_COLLECTION, employeeId, 'documents', documentId),
      { visibleToEmployee },
    );
    return true;
  } catch (error) {
    console.error('set document visibility:', error);
    return false;
  }
}

export async function deleteEmployeeDocument(
  employeeId: string,
  documentId: string,
): Promise<boolean> {
  if (isEmployeesDemoMode()) {
    return deleteDemoDocument(employeeId, documentId);
  }

  if (!db) return false;
  try {
    await deleteDoc(doc(db, EMPLOYEES_COLLECTION, employeeId, 'documents', documentId));
    return true;
  } catch (error) {
    console.error('delete document:', error);
    return false;
  }
}

export function fullName(employee: Pick<EmployeeRecord, 'firstName' | 'lastName'>): string {
  return `${employee.firstName} ${employee.lastName}`.trim();
}

export { isEmployeesDemoMode } from './isDemoMode';
export { resetDemoStore } from './demoStore';

export type { EmployeeActivityType };
