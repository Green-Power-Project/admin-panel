'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import EmployeeDetailTabs from '@/components/employees/EmployeeDetailTabs';
import EmployeeAppDataTabs from '@/components/employees/EmployeeAppDataTabs';
import EmployeeAppDataPanel from '@/components/employees/EmployeeAppDataPanel';
import PersonalInfoSection from '@/components/employees/PersonalInfoSection';
import AppAccountSection from '@/components/employees/AppAccountSection';
import EmploymentSection from '@/components/employees/EmploymentSection';
import PermissionsSection from '@/components/employees/PermissionsSection';
import ProjectsSection from '@/components/employees/ProjectsSection';
import DocumentsSection from '@/components/employees/DocumentsSection';
import ActivitySection from '@/components/employees/ActivitySection';
import EmployeeStatusBadge from '@/components/employees/EmployeeStatusBadge';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  addEmployeeDocument,
  assignProjectToEmployee,
  deleteEmployeeDocument,
  setEmployeeDocumentVisibility,
  fullName,
  removeProjectAssignment,
  subscribeEmployee,
  subscribeEmployeeAssignments,
  subscribeEmployeeDocuments,
  subscribeProjects,
  updateEmployee,
} from '@/lib/employees/employeeFirestore';
import {
  getWorkingTimeModels,
  subscribeTemplates,
} from '@/lib/templates/templatesStore';
import type { WorkingTimeModel } from '@/lib/employees/types';
import type {
  EmployeeAppDataTab,
  EmployeePermissions,
  EmployeeWorkingTime,
  EmployeeDetailTab,
  EmployeeDocumentRecord,
  EmployeeProjectAssignment,
  EmployeeRecord,
  ProjectOption,
} from '@/lib/employees/types';

export default function EmployeeDetailPage() {
  return (
    <ProtectedRoute>
      <AdminLayout>
        <EmployeeDetailContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

function EmployeeDetailContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const employeeId = params.id as string;

  const [employee, setEmployee] = useState<EmployeeRecord | null>(null);
  const [assignments, setAssignments] = useState<EmployeeProjectAssignment[]>([]);
  const [documents, setDocuments] = useState<EmployeeDocumentRecord[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<EmployeeDetailTab>('personal');
  const [appDataTab, setAppDataTab] = useState<EmployeeAppDataTab>('time');
  const [editing, setEditing] = useState(searchParams.get('edit') === '1');
  const [form, setForm] = useState<Partial<EmployeeRecord>>({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [workingTimeModels, setWorkingTimeModels] = useState<
    WorkingTimeModel[]
  >([]);

  // Working-time templates come from the Templates admin area, so a model the
  // admin adds there is immediately offered here.
  useEffect(
    () => subscribeTemplates(() => setWorkingTimeModels(getWorkingTimeModels())),
    [],
  );

  useEffect(() => {
    if (!employeeId) return;
    setLoading(true);

    const unsubEmployee = subscribeEmployee(
      employeeId,
      (record) => {
        setEmployee(record);
        if (record) {
          setForm(record);
          setNotFound(false);
        } else {
          setNotFound(true);
        }
        setLoading(false);
      },
      () => {
        setNotFound(true);
        setLoading(false);
      },
    );

    const unsubAssignments = subscribeEmployeeAssignments(employeeId, setAssignments);
    const unsubDocuments = subscribeEmployeeDocuments(employeeId, setDocuments);
    const unsubProjects = subscribeProjects(setProjects);

    return () => {
      unsubEmployee();
      unsubAssignments();
      unsubDocuments();
      unsubProjects();
    };
  }, [employeeId]);

  const handleFormChange = (field: keyof EmployeeRecord, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleWorkingTimeChange = (workingTime: EmployeeWorkingTime) => {
    setForm((prev) => ({ ...prev, workingTime }));
  };

  const handlePermissionsChange = (permissions: EmployeePermissions) => {
    setForm((prev) => ({ ...prev, permissions }));
  };

  const handleSave = async () => {
    if (!employee) return;
    setSaving(true);
    setSaveMessage('');
    const ok = await updateEmployee(employee.id, form);
    setSaving(false);
    if (ok) {
      setEditing(false);
      setSaveMessage(t('employeesDetail.saved'));
      router.replace(`/employees/${employee.id}`);
    } else {
      setSaveMessage(t('employeesDetail.saveFailed'));
    }
  };

  const handleToggleStatus = async () => {
    if (!employee) return;
    const next = employee.status === 'active' ? 'inactive' : 'active';
    await updateEmployee(employee.id, { status: next });
  };

  const assignedProjects = projects.filter((p) =>
    assignments.some((a) => a.projectId === p.id),
  );

  if (loading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-200 rounded" />
          <div className="h-32 bg-gray-100 rounded-xl" />
          <div className="h-64 bg-gray-100 rounded-xl" />
        </div>
      </div>
    );
  }

  if (notFound || !employee) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/employees" className="text-sm text-green-power-600 hover:text-green-power-700 font-medium">
          ← {t('employeesDetail.backToEmployees')}
        </Link>
        <div className="mt-6 bg-gray-50 border border-dashed border-gray-200 rounded-lg p-8 text-center">
          <p className="text-sm font-medium text-gray-700">{t('employeesDetail.notFound')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 space-y-4 min-w-0 max-w-full">
      <Link href="/employees" className="text-sm text-green-power-600 hover:text-green-power-700 font-medium">
        ← {t('employeesDetail.backToEmployees')}
      </Link>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-green-power-50 to-green-power-100">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                <span className="text-white font-bold text-lg">
                  {(employee.firstName || employee.lastName || '?').charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <h2 className="text-lg md:text-xl font-semibold text-gray-900">{fullName(employee)}</h2>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <span className="text-xs text-gray-600">{employee.employeeNumber}</span>
                  <EmployeeStatusBadge status={employee.status} />
                  <span className="text-xs text-gray-500">
                    {employee.appAccessEnabled
                      ? t('employees.appAccessEnabled')
                      : t('employees.appAccessDisabled')}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {editing ? (
                <>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 bg-green-power-600 text-white text-sm font-medium rounded-lg hover:bg-green-power-700 disabled:opacity-50"
                  >
                    {saving ? t('employeesDetail.saving') : t('common.save')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setForm(employee);
                    }}
                    className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
                  >
                    {t('common.cancel')}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleStatus}
                    className="px-4 py-2 border border-amber-300 text-amber-800 text-sm font-medium rounded-lg hover:bg-amber-50"
                  >
                    {employee.status === 'active'
                      ? t('employees.deactivate')
                      : t('employees.activate')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {saveMessage && (
          <div className="px-6 py-3 bg-green-50 border-b border-green-100 text-sm text-green-800">
            {saveMessage}
          </div>
        )}

        <div className="px-6 py-4 border-b border-gray-100">
          <EmployeeDetailTabs activeTab={activeTab} onChange={setActiveTab} />
        </div>

        <div className="px-6 py-6">
          {activeTab === 'personal' && (
            <PersonalInfoSection
              employee={employee}
              editing={editing}
              form={form}
              onChange={handleFormChange}
            />
          )}

          {activeTab === 'appAccount' && (
            <AppAccountSection
              employee={employee}
              editing={editing}
              form={form}
              onChange={handleFormChange}
            />
          )}

          {activeTab === 'employment' && (
            <EmploymentSection
              employee={employee}
              editing={editing}
              form={form}
              onChangeField={handleFormChange}
              onChangeWorkingTime={handleWorkingTimeChange}
              models={workingTimeModels}
            />
          )}

          {activeTab === 'permissions' && (
            <PermissionsSection
              employee={employee}
              editing={editing}
              form={form}
              onChange={handlePermissionsChange}
            />
          )}

          {activeTab === 'projects' && (
            <ProjectsSection
              assignments={assignments}
              projects={projects}
              onAssign={async (project) => {
                await assignProjectToEmployee(employee.id, project);
              }}
              onRemove={async (assignmentId) => {
                await removeProjectAssignment(assignmentId);
              }}
            />
          )}

          {activeTab === 'documents' && (
            <DocumentsSection
              documents={documents}
              onUpload={async (input) => {
                await addEmployeeDocument(employee.id, input);
              }}
              onDelete={async (docId) => {
                await deleteEmployeeDocument(employee.id, docId);
              }}
              onToggleVisibility={async (docId, visible) => {
                await setEmployeeDocumentVisibility(employee.id, docId, visible);
              }}
            />
          )}

          {activeTab === 'appData' && (
            <div className="space-y-4">
              <EmployeeAppDataTabs activeTab={appDataTab} onChange={setAppDataTab} />
              <EmployeeAppDataPanel employeeId={employee.id} section={appDataTab} />
            </div>
          )}

          {activeTab === 'activity' && (
            <ActivitySection
              employeeId={employee.id}
              projects={assignedProjects.length > 0 ? assignedProjects : projects}
            />
          )}
        </div>
      </div>
    </div>
  );
}
