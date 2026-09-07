import {
  DEFAULT_PERMISSIONS,
  DEFAULT_WORKING_TIME_MODELS,
  workingTimeFromModel,
} from './types';
import type {
  EmployeeAppData,
  EmployeeDocumentRecord,
  EmployeeProjectAssignment,
  EmployeeRecord,
  ProjectOption,
} from './types';

/** Templates offered when setting up an employee (requirement 53). */
export const DEMO_WORKING_TIME_MODELS = DEFAULT_WORKING_TIME_MODELS;

export const DEMO_PROJECTS: ProjectOption[] = [
  { id: 'demo-proj-001', name: 'Solar Park Nord', projectNumber: 'GP-2024-101' },
  { id: 'demo-proj-002', name: 'Wohnanlage Südtor', projectNumber: 'GP-2024-088' },
  { id: 'demo-proj-003', name: 'Gewerbehalle Ost', projectNumber: 'GP-2023-045' },
];

export const DEMO_EMPLOYEES: EmployeeRecord[] = [
  {
    id: 'demo-emp-001',
    employeeNumber: 'EMP-1001',
    firstName: 'Max',
    lastName: 'Müller',
    email: 'max.mueller@greenpower.demo',
    phone: '+49 170 1234567',
    role: 'foreman',
    status: 'active',
    appAccessEnabled: true,
    language: 'de',
    jobTitle: 'Vorarbeiter Elektro',
    department: 'Montage',
    startDate: '2021-03-15',
    notes: 'Teamleiter auf Großprojekten. Schwerpunkt PV-Montage.',
    endDate: '',
    workingTime: workingTimeFromModel(DEMO_WORKING_TIME_MODELS[0]),
    permissions: {
      ...DEFAULT_PERMISSIONS,
      recordColleagueHours: true,
      correctHours: true,
      orderMaterial: true,
      createMeasurements: true,
      viewOtherEmployees: true,
    },
    assignedProjectIds: ['demo-proj-001', 'demo-proj-002'],
    createdAt: new Date('2024-01-10'),
    updatedAt: new Date('2025-08-01'),
  },
  {
    id: 'demo-emp-002',
    employeeNumber: 'EMP-1002',
    firstName: 'Anna',
    lastName: 'Schmidt',
    email: 'anna.schmidt@greenpower.demo',
    phone: '+49 171 2345678',
    role: 'skilledWorker',
    status: 'active',
    appAccessEnabled: true,
    language: 'en',
    jobTitle: 'Electrician',
    department: 'Installation',
    startDate: '2022-06-01',
    notes: 'Prefers English app language.',
    endDate: '',
    workingTime: workingTimeFromModel(DEMO_WORKING_TIME_MODELS[0]),
    permissions: { ...DEFAULT_PERMISSIONS },
    assignedProjectIds: ['demo-proj-001'],
    createdAt: new Date('2024-02-05'),
    updatedAt: new Date('2025-07-20'),
  },
  {
    id: 'demo-emp-003',
    employeeNumber: 'EMP-1003',
    firstName: 'Thomas',
    lastName: 'Weber',
    email: 'thomas.weber@greenpower.demo',
    phone: '+49 172 3456789',
    role: 'master',
    status: 'inactive',
    appAccessEnabled: false,
    language: 'de',
    jobTitle: 'Bauleiter',
    department: 'Project Management',
    startDate: '2019-11-01',
    notes: 'Currently on leave — app access disabled.',
    endDate: '2025-06-30',
    workingTime: workingTimeFromModel(DEMO_WORKING_TIME_MODELS[0]),
    permissions: {
      ...DEFAULT_PERMISSIONS,
      recordColleagueHours: true,
      correctHours: true,
      orderMaterial: true,
      createMeasurements: true,
      viewOtherEmployees: true,
    },
    assignedProjectIds: [],
    createdAt: new Date('2023-05-12'),
    updatedAt: new Date('2025-06-01'),
  },
  {
    id: 'demo-emp-004',
    employeeNumber: 'EMP-1004',
    firstName: 'Laura',
    lastName: 'Fischer',
    email: 'laura.fischer@greenpower.demo',
    phone: '+49 173 4567890',
    role: 'skilledWorker',
    status: 'active',
    appAccessEnabled: true,
    language: 'de',
    jobTitle: 'Monteurin',
    department: 'Montage',
    startDate: '2023-09-01',
    notes: '',
    endDate: '',
    workingTime: workingTimeFromModel(DEMO_WORKING_TIME_MODELS[1]),
    permissions: { ...DEFAULT_PERMISSIONS, createMeasurements: true },
    assignedProjectIds: ['demo-proj-003'],
    createdAt: new Date('2024-04-18'),
    updatedAt: new Date('2025-08-10'),
  },
];

export const DEMO_ASSIGNMENTS: EmployeeProjectAssignment[] = [
  {
    id: 'demo-asg-001',
    employeeId: 'demo-emp-001',
    projectId: 'demo-proj-001',
    projectName: 'Solar Park Nord',
    assignedAt: new Date('2024-03-01'),
  },
  {
    id: 'demo-asg-002',
    employeeId: 'demo-emp-001',
    projectId: 'demo-proj-002',
    projectName: 'Wohnanlage Südtor',
    assignedAt: new Date('2024-05-15'),
  },
  {
    id: 'demo-asg-003',
    employeeId: 'demo-emp-002',
    projectId: 'demo-proj-001',
    projectName: 'Solar Park Nord',
    assignedAt: new Date('2024-04-01'),
  },
  {
    id: 'demo-asg-004',
    employeeId: 'demo-emp-004',
    projectId: 'demo-proj-003',
    projectName: 'Gewerbehalle Ost',
    assignedAt: new Date('2024-06-01'),
  },
];

export const DEMO_DOCUMENTS: EmployeeDocumentRecord[] = [
  {
    id: 'demo-doc-001',
    employeeId: 'demo-emp-001',
    name: 'Gehaltsabrechnung Juli 2025',
    category: 'payroll',
    year: 2025,
    visibleToEmployee: true,
    fileName: 'Gehaltsabrechnung_Juli_2025.pdf',
    uploadedAt: new Date('2025-08-01'),
  },
  {
    id: 'demo-doc-002',
    employeeId: 'demo-emp-001',
    name: 'Arbeitsvertrag',
    category: 'employmentContract',
    year: 2021,
    visibleToEmployee: true,
    fileName: 'Arbeitsvertrag_Max_Mueller.pdf',
    uploadedAt: new Date('2021-03-10'),
  },
  {
    id: 'demo-doc-003',
    employeeId: 'demo-emp-002',
    name: 'Payslip June 2025',
    category: 'payroll',
    year: 2025,
    visibleToEmployee: true,
    fileName: 'Payslip_June_2025.pdf',
    uploadedAt: new Date('2025-07-05'),
  },
  {
    id: 'demo-doc-004',
    employeeId: 'demo-emp-004',
    name: 'Sicherheitsunterweisung',
    category: 'certificates',
    year: 2025,
    visibleToEmployee: false,
    fileName: 'Sicherheitsunterweisung_2025.pdf',
    uploadedAt: new Date('2025-01-15'),
  },
];

function appDataFor001(): EmployeeAppData {
  return {
    time: [
      {
        id: 'demo-time-001',
        employeeId: 'demo-emp-001',
        date: '2025-08-15',
        entryType: 'working',
        hours: 8,
        projectName: 'Solar Park Nord',
        startTime: '07:30',
        endTime: '16:30',
        breakHours: 1,
        lvPosition: '01.02 Aushub',
        note: 'Modulmontage Block A',
      },
      {
        id: 'demo-time-002',
        employeeId: 'demo-emp-001',
        date: '2025-08-15',
        entryType: 'report',
        hours: 0.5,
        projectName: 'Solar Park Nord',
        startTime: '07:00',
        endTime: '16:00',
        breakHours: 0.5,
        lvPosition: '02.01 Pflasterarbeiten',
        note: 'Tagesbericht eingereicht',
      },
      {
        id: 'demo-time-003',
        employeeId: 'demo-emp-001',
        date: '2025-08-14',
        entryType: 'working',
        hours: 7.5,
        projectName: 'Wohnanlage Südtor',
        startTime: '08:00',
        endTime: '17:00',
        breakHours: 1,
        lvPosition: '01.03 Frostschutzschicht',
        note: 'Kabelverlegung EG',
      },
    ],
    leave: [
      {
        id: 'demo-leave-001',
        employeeId: 'demo-emp-001',
        from: '2025-09-01',
        to: '2025-09-05',
        leaveType: 'Urlaub',
        status: 'approved',
        days: 5,
      },
      {
        id: 'demo-leave-002',
        employeeId: 'demo-emp-001',
        from: '2025-07-22',
        to: '2025-07-22',
        leaveType: 'Krank',
        status: 'approved',
        days: 1,
      },
    ],
    deliveryNotes: [
      {
        id: 'demo-dn-001',
        employeeId: 'demo-emp-001',
        number: 'LS-2025-0842',
        date: '2025-08-12',
        projectName: 'Solar Park Nord',
        supplier: 'PV Components GmbH',
        lineCount: 12,
        status: 'confirmed',
      },
      {
        id: 'demo-dn-002',
        employeeId: 'demo-emp-001',
        number: 'LS-2025-0799',
        date: '2025-08-05',
        projectName: 'Wohnanlage Südtor',
        supplier: 'Elektro Großhandel',
        lineCount: 6,
        status: 'confirmed',
      },
    ],
    materials: [
      {
        id: 'demo-mat-001',
        employeeId: 'demo-emp-001',
        material: 'Solarmodul 450W',
        projectName: 'Solar Park Nord',
        delivered: 120,
        installed: 98,
        remaining: 22,
        unit: 'Stk',
      },
      {
        id: 'demo-mat-002',
        employeeId: 'demo-emp-001',
        material: 'Montageschiene 4,2m',
        projectName: 'Solar Park Nord',
        delivered: 200,
        installed: 185,
        remaining: 15,
        unit: 'Stk',
      },
      {
        id: 'demo-mat-003',
        employeeId: 'demo-emp-001',
        material: 'NYM-J 5x6 mm²',
        projectName: 'Wohnanlage Südtor',
        delivered: 500,
        installed: 420,
        remaining: 80,
        unit: 'm',
      },
    ],
    documentation: [
      {
        id: 'demo-docu-001',
        employeeId: 'demo-emp-001',
        title: 'Modulmontage Block A — Fotodoku',
        projectName: 'Solar Park Nord',
        photoCount: 8,
        date: '2025-08-15',
      },
      {
        id: 'demo-docu-002',
        employeeId: 'demo-emp-001',
        title: 'Kabeltrasse EG',
        projectName: 'Wohnanlage Südtor',
        photoCount: 4,
        date: '2025-08-14',
      },
    ],
    measurement: [
      {
        id: 'demo-meas-001',
        employeeId: 'demo-emp-001',
        position: 'Dachfläche Block A — Reihe 1–4',
        projectName: 'Solar Park Nord',
        completed: 96,
        remaining: 24,
        unit: 'Module',
        date: '2025-08-15',
      },
      {
        id: 'demo-meas-002',
        employeeId: 'demo-emp-001',
        position: 'EG Kabeltrasse Nord',
        projectName: 'Wohnanlage Südtor',
        completed: 45,
        remaining: 15,
        unit: 'm',
        date: '2025-08-14',
      },
    ],
    machines: [
      {
        id: 'demo-mach-001',
        employeeId: 'demo-emp-001',
        machine: 'Hubarbeitsbühne HBL-12',
        projectName: 'Solar Park Nord',
        hours: 6,
        date: '2025-08-15',
      },
      {
        id: 'demo-mach-002',
        employeeId: 'demo-emp-001',
        machine: 'Kabeltrommelwagen',
        projectName: 'Wohnanlage Südtor',
        hours: 3.5,
        date: '2025-08-14',
      },
    ],
    reports: [
      {
        id: 'demo-rep-001',
        employeeId: 'demo-emp-001',
        title: 'Tagesbericht 15.08.2025',
        projectName: 'Solar Park Nord',
        date: '2025-08-15',
        status: 'submitted',
      },
      {
        id: 'demo-rep-002',
        employeeId: 'demo-emp-001',
        title: 'Tagesbericht 14.08.2025',
        projectName: 'Wohnanlage Südtor',
        date: '2025-08-14',
        status: 'submitted',
      },
    ],
  };
}

function appDataFor002(): EmployeeAppData {
  return {
    time: [
      {
        id: 'demo-time-101',
        employeeId: 'demo-emp-002',
        date: '2025-08-15',
        entryType: 'working',
        hours: 8,
        projectName: 'Solar Park Nord',
        note: 'Module installation row 5',
      },
    ],
    leave: [
      {
        id: 'demo-leave-101',
        employeeId: 'demo-emp-002',
        from: '2025-12-23',
        to: '2025-12-31',
        leaveType: 'Holiday',
        status: 'pending',
        days: 7,
      },
    ],
    deliveryNotes: [
      {
        id: 'demo-dn-101',
        employeeId: 'demo-emp-002',
        number: 'LS-2025-0851',
        date: '2025-08-14',
        projectName: 'Solar Park Nord',
        supplier: 'PV Components GmbH',
        lineCount: 4,
        status: 'confirmed',
      },
    ],
    materials: [
      {
        id: 'demo-mat-101',
        employeeId: 'demo-emp-002',
        material: 'MC4 Stecker',
        projectName: 'Solar Park Nord',
        delivered: 200,
        installed: 180,
        remaining: 20,
        unit: 'Stk',
      },
    ],
    documentation: [
      {
        id: 'demo-docu-101',
        employeeId: 'demo-emp-002',
        title: 'Row 5 completion photos',
        projectName: 'Solar Park Nord',
        photoCount: 3,
        date: '2025-08-15',
      },
    ],
    measurement: [
      {
        id: 'demo-meas-101',
        employeeId: 'demo-emp-002',
        position: 'Row 5 modules',
        projectName: 'Solar Park Nord',
        completed: 24,
        remaining: 0,
        unit: 'modules',
        date: '2025-08-15',
      },
    ],
    machines: [],
    reports: [
      {
        id: 'demo-rep-101',
        employeeId: 'demo-emp-002',
        title: 'Daily report 15.08.2025',
        projectName: 'Solar Park Nord',
        date: '2025-08-15',
        status: 'submitted',
      },
    ],
  };
}

function appDataFor004(): EmployeeAppData {
  return {
    time: [
      {
        id: 'demo-time-401',
        employeeId: 'demo-emp-004',
        date: '2025-08-13',
        entryType: 'working',
        hours: 7,
        projectName: 'Gewerbehalle Ost',
        note: 'Trafoanschluss',
      },
    ],
    leave: [],
    deliveryNotes: [],
    materials: [
      {
        id: 'demo-mat-401',
        employeeId: 'demo-emp-004',
        material: 'NYY-J 4x95',
        projectName: 'Gewerbehalle Ost',
        delivered: 120,
        installed: 95,
        remaining: 25,
        unit: 'm',
      },
    ],
    documentation: [],
    measurement: [],
    machines: [
      {
        id: 'demo-mach-401',
        employeeId: 'demo-emp-004',
        machine: 'Kranwagen 12t',
        projectName: 'Gewerbehalle Ost',
        hours: 4,
        date: '2025-08-13',
      },
    ],
    reports: [],
  };
}

export function createDemoAppDataMap(): Record<string, EmployeeAppData> {
  return {
    'demo-emp-001': appDataFor001(),
    'demo-emp-002': appDataFor002(),
    'demo-emp-004': appDataFor004(),
  };
}

export interface DemoStoreSnapshot {
  employees: EmployeeRecord[];
  assignments: EmployeeProjectAssignment[];
  documents: EmployeeDocumentRecord[];
  projects: ProjectOption[];
  appData: Record<string, EmployeeAppData>;
}

export function createDemoSnapshot(): DemoStoreSnapshot {
  return {
    employees: DEMO_EMPLOYEES.map((e) => ({ ...e })),
    assignments: DEMO_ASSIGNMENTS.map((a) => ({ ...a })),
    documents: DEMO_DOCUMENTS.map((d) => ({
      ...d,
      uploadedAt: new Date(d.uploadedAt),
    })),
    projects: DEMO_PROJECTS.map((p) => ({ ...p })),
    appData: createDemoAppDataMap(),
  };
}
