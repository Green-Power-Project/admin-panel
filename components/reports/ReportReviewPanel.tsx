'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import ReportStatusBadge from './ReportStatusBadge';
import { buildReportPdf, reportPdfFileName } from '@/lib/reports/reportPdf';
import { editReport, setReportStatus } from '@/lib/reports/reportsStore';
import {
  allowedTransitions,
  reportLvPositions,
  totalReportHours,
  type AdminReport,
  type AdminReportStatus,
} from '@/lib/reports/types';

/**
 * Review one report: see the linked content, amend it, move it through the
 * workflow and produce the PDF (requirement 61).
 */
export default function ReportReviewPanel({
  report,
  onBack,
}: {
  report: AdminReport;
  onBack: () => void;
}) {
  const { t } = useLanguage();
  const [title, setTitle] = useState(report.title);
  const [officeNote, setOfficeNote] = useState(report.officeNote);
  const [message, setMessage] = useState('');

  // Follow the store when the report changes underneath (e.g. after reopen).
  useEffect(() => {
    setTitle(report.title);
    setOfficeNote(report.officeNote);
  }, [report.id, report.title, report.officeNote]);

  const released = report.status === 'released';
  const lvPositions = reportLvPositions(report);

  const actionLabel = (status: AdminReportStatus) => {
    if (status === 'checked' && released) return t('adminReports.actionReopen');
    return t(`adminReports.action${status.charAt(0).toUpperCase()}${status.slice(1)}`);
  };

  const save = () => {
    if (editReport(report.id, { title, officeNote })) {
      setMessage(t('adminReports.saved'));
    }
  };

  const createPdf = () => {
    const doc = buildReportPdf(report, {
      documentTitle: t('adminReports.reportTitle'),
      project: t('adminReports.project'),
      employee: t('adminReports.employee'),
      date: t('adminReports.date'),
      status: t('adminReports.status'),
      hoursSection: t('adminReports.hours'),
      machinesSection: t('adminReports.machines'),
      materialsSection: t('adminReports.materials'),
      deliveryNotesSection: t('adminReports.deliveryNotes'),
      documentationSection: t('adminReports.documentation'),
      lvSection: t('adminReports.lv'),
      officeNote: t('adminReports.officeNote'),
      total: t('adminReports.total'),
      none: t('adminReports.none'),
      draftWatermark: t('adminReports.draftWatermark'),
    });
    doc.save(reportPdfFileName(report));
  };

  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="text-sm text-green-power-700 hover:text-green-power-800">
        ← {t('adminReports.back')}
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{report.title}</h2>
          <p className="text-sm text-gray-600 mt-1">
            {report.date} · {report.projectName} · {report.employeeName}
          </p>
          {report.title !== report.originalTitle && (
            <p className="text-xs text-gray-500 mt-1">
              {t('adminReports.originalTitle')}: {report.originalTitle}
            </p>
          )}
        </div>
        <ReportStatusBadge status={report.status} />
      </div>

      {/* Workflow actions */}
      <div className="rounded-lg border border-gray-200 p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {allowedTransitions(report.status).map((next) => (
            <button
              key={next}
              type="button"
              onClick={() => setReportStatus(report.id, next)}
              className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                next === 'released'
                  ? 'bg-green-power-600 text-white hover:bg-green-power-700'
                  : 'border border-gray-300 text-gray-700 hover:border-green-power-400'
              }`}
            >
              {actionLabel(next)}
            </button>
          ))}
          <button
            type="button"
            onClick={createPdf}
            className="ml-auto px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:border-green-power-400"
          >
            {t('adminReports.pdf')}
          </button>
        </div>

        {released && <p className="text-xs text-amber-700">{t('adminReports.releasedHint')}</p>}

        <div className="flex flex-wrap gap-4 text-xs text-gray-500">
          {report.checkedAt && <span>{t('adminReports.checkedAt')}: {report.checkedAt.slice(0, 16).replace('T', ' ')}</span>}
          {report.editedAt && <span>{t('adminReports.editedAt')}: {report.editedAt.slice(0, 16).replace('T', ' ')}</span>}
          {report.releasedAt && <span>{t('adminReports.releasedAt')}: {report.releasedAt.slice(0, 16).replace('T', ' ')}</span>}
        </div>
      </div>

      {/* Office amendments */}
      <div className="rounded-lg border border-gray-200 p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">{t('adminReports.editTitle')}</label>
            <input value={title} disabled={released} onChange={(e) => setTitle(e.target.value)} className={INPUT} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">{t('adminReports.officeNote')}</label>
            <input
              value={officeNote}
              disabled={released}
              placeholder={t('adminReports.officeNotePlaceholder')}
              onChange={(e) => setOfficeNote(e.target.value)}
              className={INPUT}
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={released}
            className="px-4 py-2 bg-green-power-600 text-white text-sm font-medium rounded-lg hover:bg-green-power-700 disabled:opacity-50"
          >
            {t('adminReports.save')}
          </button>
          {message && <span className="text-xs text-green-power-700">{message}</span>}
        </div>
      </div>

      <p className="text-xs text-gray-500">{t('adminReports.linkedHint')}</p>

      {/* Linked content */}
      <Section title={`${t('adminReports.hours')} — ${t('adminReports.total')}: ${totalReportHours(report)} h`}>
        {report.reportHours.length === 0 ? <Empty /> : report.reportHours.map((h) => (
          <Row key={h.id}
            primary={`${h.hours} h${h.startTime && h.endTime ? ` (${h.startTime}–${h.endTime})` : ''}`}
            secondary={[h.date, h.note, h.lvPosition].filter(Boolean).join(' · ')} />
        ))}
      </Section>

      {lvPositions.length > 0 && (
        <Section title={t('adminReports.lv')}>
          {lvPositions.map((p) => (<Row key={p} primary={p} secondary="" />))}
        </Section>
      )}

      <Section title={t('adminReports.machines')}>
        {report.machines.length === 0 ? <Empty /> : report.machines.map((m) => (
          <Row key={m.id} primary={m.machine} secondary={`${m.date} · ${m.hours} h`} />
        ))}
      </Section>

      <Section title={t('adminReports.materials')}>
        {report.materials.length === 0 ? <Empty /> : report.materials.map((m) => (
          <Row key={m.id} primary={m.material} secondary={`${m.installed} / ${m.delivered} ${m.unit}`} />
        ))}
      </Section>

      <Section title={t('adminReports.deliveryNotes')}>
        {report.deliveryNotes.length === 0 ? <Empty /> : report.deliveryNotes.map((n) => (
          <Row key={n.id} primary={n.number} secondary={`${n.date} · ${n.supplier} · ${n.lineCount}`} />
        ))}
      </Section>

      <Section title={t('adminReports.documentation')}>
        {report.documentation.length === 0 ? <Empty /> : report.documentation.map((d) => (
          <Row key={d.id} primary={d.title} secondary={`${d.date} · ${d.photoCount}`} />
        ))}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
        <span className="text-sm font-semibold text-gray-900">{title}</span>
      </div>
      <div className="divide-y divide-gray-100">{children}</div>
    </div>
  );
}

function Row({ primary, secondary }: { primary: string; secondary: string }) {
  return (
    <div className="px-4 py-2.5 flex flex-wrap items-baseline gap-x-3">
      <span className="text-sm font-medium text-gray-900">{primary}</span>
      {secondary && <span className="text-xs text-gray-500">{secondary}</span>}
    </div>
  );
}

function Empty() {
  const { t } = useLanguage();
  return <div className="px-4 py-3 text-sm text-gray-500">{t('adminReports.none')}</div>;
}

const INPUT =
  'w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-power-500 disabled:bg-gray-50 disabled:text-gray-500';
