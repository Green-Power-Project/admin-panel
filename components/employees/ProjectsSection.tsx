'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import type { EmployeeProjectAssignment, ProjectOption } from '@/lib/employees/types';

interface ProjectsSectionProps {
  assignments: EmployeeProjectAssignment[];
  projects: ProjectOption[];
  onAssign: (project: ProjectOption) => Promise<void>;
  onRemove: (assignmentId: string) => Promise<void>;
}

export default function ProjectsSection({
  assignments,
  projects,
  onAssign,
  onRemove,
}: ProjectsSectionProps) {
  const { t } = useLanguage();
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [busy, setBusy] = useState(false);

  const assignedIds = new Set(assignments.map((a) => a.projectId));
  const availableProjects = projects.filter((p) => !assignedIds.has(p.id));

  const handleAssign = async () => {
    const project = projects.find((p) => p.id === selectedProjectId);
    if (!project) return;
    setBusy(true);
    try {
      await onAssign(project);
      setSelectedProjectId('');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (assignmentId: string) => {
    setBusy(true);
    try {
      await onRemove(assignmentId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-gray-900">{t('employees.projectsTitle')}</h3>
        <p className="text-sm text-gray-600 mt-1">{t('employees.projectsDesc')}</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <select
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-power-500"
          disabled={busy || availableProjects.length === 0}
        >
          <option value="">{t('employees.selectProject')}</option>
          {availableProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.projectNumber ? `${p.projectNumber} — ${p.name}` : p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleAssign}
          disabled={!selectedProjectId || busy}
          className="px-4 py-2 bg-green-power-600 text-white text-sm font-medium rounded-lg hover:bg-green-power-700 disabled:opacity-50 transition-colors"
        >
          {t('employees.assignProject')}
        </button>
      </div>

      {assignments.length === 0 ? (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-8 text-center">
          <p className="text-sm font-medium text-gray-700">{t('employees.noProjectsAssigned')}</p>
          <p className="mt-1 text-xs text-gray-500">{t('employees.noProjectsAssignedHint')}</p>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">
                  {t('employees.projectName')}
                </th>
                <th className="px-4 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {assignments.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/projects/${a.projectId}`}
                      className="text-sm text-green-power-700 hover:text-green-power-800 font-medium"
                    >
                      {a.projectName}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => handleRemove(a.id)}
                      disabled={busy}
                      className="text-xs text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
                    >
                      {t('employees.removeAssignment')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
