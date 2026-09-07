/** Material order raised in the app (requirements 31, 32, 63). */
export interface MaterialOrderRecord {
  id: string;
  projectName: string;
  employeeName: string;
  material: string;
  quantity: number;
  unit: string;
  /** Delivery date the site asked for (ISO yyyy-mm-dd). */
  requestedDate: string;
  createdDate: string;
  comment: string;
  status: MaterialOrderStatus;
}

export const MATERIAL_ORDER_STATUSES = [
  'new',
  'ordered',
  'delivered',
  'completed',
] as const;

export type MaterialOrderStatus = (typeof MATERIAL_ORDER_STATUSES)[number];

/** Task the admin creates and assigns to employees (requirements 39, 40, 64). */
export interface TaskRecord {
  id: string;
  projectName: string;
  title: string;
  description: string;
  date: string;
  /** Optional appointment date-time (requirement 41). */
  appointment: string;
  priority: TaskPriority;
  status: TaskStatus;
  /** Employees allowed to see it (requirement 39). */
  assignedEmployeeIds: string[];
  adminNote: string;
}

export const TASK_STATUSES = ['open', 'inProgress', 'completed'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['low', 'normal', 'high'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** Correction an employee requested on a time entry (requirements 14, 49). */
export interface CorrectionRequestRecord {
  id: string;
  employeeName: string;
  projectName: string;
  entryDate: string;
  requestedAt: string;
  reason: string;
  resolved: boolean;
}

/** Project note written in the app or the office (requirements 29, 49). */
export interface ProjectNoteRecord {
  id: string;
  projectName: string;
  authorName: string;
  createdAt: string;
  text: string;
  /** Office-only notes never reach the app. */
  internalOnly: boolean;
  /** Cleared once the office has read it. */
  isNew: boolean;
}

export interface OperationsSnapshot {
  orders: MaterialOrderRecord[];
  tasks: TaskRecord[];
  corrections: CorrectionRequestRecord[];
  notes: ProjectNoteRecord[];
}

/** Statuses that still need the office to act (requirement 49). */
export function isOpenOrder(order: MaterialOrderRecord): boolean {
  return order.status === 'new' || order.status === 'ordered';
}

export function isOpenTask(task: TaskRecord): boolean {
  return task.status !== 'completed';
}
