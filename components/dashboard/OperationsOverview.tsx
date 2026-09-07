'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { getDemoAppData, getDemoEmployees, subscribeDemoStore } from '@/lib/employees/demoStore';
import {
  countAppointmentsOn,
  countNewNotes,
  countNewOrders,
  countOpenCorrections,
  countOpenTasks,
  subscribeOperations,
} from '@/lib/operations/operationsStore';
import {
  countOpenReports,
  subscribeReportReviews,
} from '@/lib/reports/reportsStore';

interface Tile {
  key: string;
  value: number;
  href: string;
}

/**
 * The admin homepage figures of requirement 49.
 *
 * Everything is derived from the same demo stores the other admin screens
 * read, so a status change on /orders or /tasks moves these numbers too.
 */
export default function OperationsOverview() {
  const { t } = useLanguage();
  const [tiles, setTiles] = useState<Tile[]>([]);

  useEffect(() => {
    const recompute = () => {
      const today = new Date().toISOString().slice(0, 10);
      const employees = getDemoEmployees();

      const projectIds = new Set<string>();
      let workingToday = 0;
      let newDeliveryNotes = 0;

      for (const employee of employees) {
        employee.assignedProjectIds.forEach((id) => projectIds.add(id));
        const data = getDemoAppData(employee.id);
        if (data.time.some((entry) => entry.date === today)) workingToday += 1;
        newDeliveryNotes += data.deliveryNotes.filter((n) => n.status === 'draft').length;
      }

      setTiles([
        { key: 'activeProjects', value: projectIds.size, href: '/projects' },
        { key: 'workingToday', value: workingToday, href: '/controlling' },
        { key: 'openTasks', value: countOpenTasks(), href: '/tasks' },
        { key: 'newOrders', value: countNewOrders(), href: '/orders' },
        { key: 'newDeliveryNotes', value: newDeliveryNotes, href: '/controlling' },
        // Anything not yet released still needs the office (requirement 61).
        { key: 'openReports', value: countOpenReports(), href: '/reports' },
        { key: 'corrections', value: countOpenCorrections(), href: '/controlling' },
        { key: 'appointmentsToday', value: countAppointmentsOn(today), href: '/tasks' },
        { key: 'newNotes', value: countNewNotes(), href: '/tasks' },
      ]);
    };

    const unsubEmployees = subscribeDemoStore(recompute);
    const unsubOperations = subscribeOperations(recompute);
    const unsubReports = subscribeReportReviews(recompute);
    return () => {
      unsubEmployees();
      unsubOperations();
      unsubReports();
    };
  }, []);

  return (
    <div className="mb-8">
      <div className="mb-3">
        <h3 className="text-base font-semibold text-gray-900">{t('dashboardOps.opsTitle')}</h3>
        <p className="text-sm text-gray-600">{t('dashboardOps.opsDesc')}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {tiles.map((tile) => (
          <Link
            key={tile.key}
            href={tile.href}
            className="rounded-lg border border-gray-200 bg-white px-4 py-3 hover:border-green-power-400 transition-colors"
          >
            <p className={`text-2xl font-bold ${tile.value > 0 ? 'text-green-power-700' : 'text-gray-300'}`}>
              {tile.value}
            </p>
            <p className="text-xs text-gray-600 mt-0.5 leading-snug">
              {t(`dashboardOps.${tile.key}`)}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
