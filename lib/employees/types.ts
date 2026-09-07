/// Role / qualification id. Built-ins are listed in DEFAULT_EMPLOYEE_ROLES;
/// the admin can add their own, so this is an open string rather than a union.
export type EmployeeRole = string;

/** One selectable role/qualification (requirement 51). */
export interface EmployeeRoleDefinition {
  id: string;
  /** Fallback label; the UI prefers the `employees.role.<id>` translation. */
  label: string;
  isCustom: boolean;
}

/** Employment model (requirement 50). */
export type EmploymentType = 'fullTime' | 'partTime' | 'miniJob';

export type WeekDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export const WEEK_DAYS: WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/**
 * Per-employee app permissions (requirement 52).
 *
 * Every flag maps to something the employee app lets the user do; the app
 * reads these once the two sides share a backend.
 */
export interface EmployeePermissions {
  recordOwnHours: boolean;
  recordColleagueHours: boolean;
  correctHours: boolean;
  createReports: boolean;
  orderMaterial: boolean;
  createMeasurements: boolean;
  scanDeliveryNotes: boolean;
  viewProjectDocuments: boolean;
  editTasks: boolean;
  viewOtherEmployees: boolean;
}

export const PERMISSION_KEYS: Array<keyof EmployeePermissions> = [
  'recordOwnHours',
  'recordColleagueHours',
  'correctHours',
  'createReports',
  'orderMaterial',
  'createMeasurements',
  'scanDeliveryNotes',
  'viewProjectDocuments',
  'editTasks',
  'viewOtherEmployees',
];

/** Break rule: after `afterHours` worked, `breakMinutes` are deducted. */
export interface BreakRule {
  afterHours: number;
  breakMinutes: number;
}

/** Reusable working-time template (requirement 53). */
export interface WorkingTimeModel {
  id: string;
  name: string;
  employmentType: EmploymentType;
  workingDays: WeekDay[];
  /** Target hours on each working day. */
  targetHoursPerDay: number;
  breakRules: BreakRule[];
  isCustom: boolean;
}

/** The working-time setup actually applied to one employee. */
export interface EmployeeWorkingTime {
  /** Template this was seeded from; null once freely adjusted. */
  modelId: string | null;
  employmentType: EmploymentType;
  workingDays: WeekDay[];
  targetHoursPerDay: number;
  breakRules: BreakRule[];
}

export const DEFAULT_PERMISSIONS: EmployeePermissions = {
  recordOwnHours: true,
  recordColleagueHours: false,
  correctHours: false,
  createReports: true,
  orderMaterial: false,
  createMeasurements: false,
  scanDeliveryNotes: true,
  viewProjectDocuments: true,
  editTasks: true,
  viewOtherEmployees: false,
};

export const DEFAULT_EMPLOYEE_ROLES: EmployeeRoleDefinition[] = [
  { id: 'master', label: 'Master', isCustom: false },
  { id: 'foreman', label: 'Foreman', isCustom: false },
  { id: 'skilledWorker', label: 'Skilled Worker', isCustom: false },
  { id: 'machineOperator', label: 'Machine Operator', isCustom: false },
  { id: 'helper', label: 'Helper', isCustom: false },
  { id: 'apprentice', label: 'Apprentice', isCustom: false },
  { id: 'minijobWorker', label: 'Minijob Worker', isCustom: false },
  // Retained so employees seeded before the catalog still resolve to a label.
  { id: 'employee', label: 'Employee', isCustom: false },
  { id: 'siteManager', label: 'Site Manager', isCustom: false },
];

export const DEFAULT_WORKING_TIME_MODELS: WorkingTimeModel[] = [
  {
    id: 'wtm-full-time',
    name: 'Full-time',
    employmentType: 'fullTime',
    workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
    targetHoursPerDay: 8.5,
    breakRules: [
      { afterHours: 6, breakMinutes: 30 },
      { afterHours: 9, breakMinutes: 45 },
    ],
    isCustom: false,
  },
  {
    id: 'wtm-part-time',
    name: 'Part-time',
    employmentType: 'partTime',
    workingDays: ['mon', 'tue', 'wed', 'thu'],
    targetHoursPerDay: 4,
    breakRules: [{ afterHours: 6, breakMinutes: 30 }],
    isCustom: false,
  },
  {
    id: 'wtm-minijob',
    name: 'Minijob',
    employmentType: 'miniJob',
    workingDays: ['mon', 'wed'],
    targetHoursPerDay: 4,
    breakRules: [],
    isCustom: false,
  },
];

export function workingTimeFromModel(model: WorkingTimeModel): EmployeeWorkingTime {
  return {
    modelId: model.id,
    employmentType: model.employmentType,
    workingDays: [...model.workingDays],
    targetHoursPerDay: model.targetHoursPerDay,
    breakRules: model.breakRules.map((rule) => ({ ...rule })),
  };
}

export function weeklyTargetHours(workingTime: EmployeeWorkingTime): number {
  return workingTime.workingDays.length * workingTime.targetHoursPerDay;
}

export type EmployeeStatus = 'active' | 'inactive';

export type EmployeeAppLanguage = 'en' | 'de';

export type EmployeeDetailTab =
  | 'personal'
  | 'employment'
  | 'permissions'
  | 'appAccount'
  | 'projects'
  | 'documents'
  | 'appData'
  | 'activity';

export type EmployeeAppDataTab =
  | 'time'
  | 'leave'
  | 'deliveryNotes'
  | 'materials'
  | 'documentation'
  | 'measurement'
  | 'machines'
  | 'reports';

export type EmployeeActivityType = EmployeeAppDataTab;

export interface EmployeeRecord {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: EmployeeRole;
  status: EmployeeStatus;
  appAccessEnabled: boolean;
  language: EmployeeAppLanguage;
  jobTitle: string;
  department: string;
  startDate: string;
  /** Exit date; empty while the employee is still with the company. */
  endDate: string;
  notes: string;
  assignedProjectIds: string[];
  workingTime: EmployeeWorkingTime;
  permissions: EmployeePermissions;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface EmployeeListItem extends EmployeeRecord {
  assignedProjectCount: number;
}

export interface EmployeeProjectAssignment {
  id: string;
  employeeId: string;
  projectId: string;
  projectName: string;
  assignedAt?: Date;
}

export interface EmployeeDocumentRecord {
  id: string;
  employeeId: string;
  name: string;
  /** Payroll, Employment Contract, Vacation, Sick Leave, Certificates, Other. */
  category: string;
  /** Folder year, e.g. 2026 (requirement 65). */
  year: number;
  /** Only released documents reach the employee app. */
  visibleToEmployee: boolean;
  uploadedAt: Date;
  fileName: string;
}

export const EMPLOYEE_DOCUMENT_CATEGORIES = [
  'payroll',
  'employmentContract',
  'vacation',
  'sickLeave',
  'certificates',
  'other',
] as const;

export type EmployeeDocumentCategory =
  (typeof EMPLOYEE_DOCUMENT_CATEGORIES)[number];

export interface EmployeeActivityItem {
  id: string;
  type: EmployeeActivityType;
  title: string;
  projectName: string;
  date: Date;
  summary: string;
}

export interface ProjectOption {
  id: string;
  name: string;
  projectNumber?: string;
}

export interface EmployeeTimeEntry {
  id: string;
  employeeId: string;
  date: string;
  entryType: 'working' | 'report';
  /** Net worked hours. */
  hours: number;
  projectName: string;
  note: string;
  /** Clock times, when the app recorded them (requirement 60). */
  startTime?: string;
  endTime?: string;
  breakHours?: number;
  /** BOQ position the hours were booked on (requirements 9, 10, 59). */
  lvPosition?: string;
}

export interface EmployeeLeaveRecord {
  id: string;
  employeeId: string;
  from: string;
  to: string;
  leaveType: string;
  status: 'approved' | 'pending' | 'rejected';
  days: number;
}

export interface EmployeeDeliveryNoteRecord {
  id: string;
  employeeId: string;
  number: string;
  date: string;
  projectName: string;
  supplier: string;
  lineCount: number;
  status: 'confirmed' | 'draft';
}

export interface EmployeeMaterialRecord {
  id: string;
  employeeId: string;
  material: string;
  projectName: string;
  delivered: number;
  installed: number;
  remaining: number;
  unit: string;
}

export interface EmployeeDocumentationRecord {
  id: string;
  employeeId: string;
  title: string;
  projectName: string;
  photoCount: number;
  date: string;
}

export interface EmployeeMeasurementRecord {
  id: string;
  employeeId: string;
  position: string;
  projectName: string;
  completed: number;
  remaining: number;
  unit: string;
  date: string;
}

export interface EmployeeMachineRecord {
  id: string;
  employeeId: string;
  machine: string;
  projectName: string;
  hours: number;
  date: string;
}

export interface EmployeeReportRecord {
  id: string;
  employeeId: string;
  title: string;
  projectName: string;
  date: string;
  status: 'submitted' | 'draft';
}

export interface EmployeeAppData {
  time: EmployeeTimeEntry[];
  leave: EmployeeLeaveRecord[];
  deliveryNotes: EmployeeDeliveryNoteRecord[];
  materials: EmployeeMaterialRecord[];
  documentation: EmployeeDocumentationRecord[];
  measurement: EmployeeMeasurementRecord[];
  machines: EmployeeMachineRecord[];
  reports: EmployeeReportRecord[];
}
