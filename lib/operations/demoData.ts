import type { OperationsSnapshot } from './types';

/** Seeded to today's dates so the dashboard and filters show live figures. */
export function createOperationsSnapshot(): OperationsSnapshot {
  return {
    orders: [
      { id: 'ord-001', projectName: 'Solar Park Nord', employeeName: 'Max Müller', material: 'Splitt 2/5', quantity: 12, unit: 'to', requestedDate: '2026-09-08', createdDate: '2026-09-06', comment: 'Abladen mit Kran erforderlich', status: 'new' },
      { id: 'ord-002', projectName: 'Solar Park Nord', employeeName: 'Anna Schmidt', material: 'Transportbeton C25/30', quantity: 4.5, unit: 'm³', requestedDate: '2026-09-07', createdDate: '2026-09-06', comment: '', status: 'new' },
      { id: 'ord-003', projectName: 'Wohnanlage Südtor', employeeName: 'Max Müller', material: 'Bordstein 100/15/30', quantity: 60, unit: 'lfdm', requestedDate: '2026-09-05', createdDate: '2026-09-03', comment: 'Lieferung bis 07:00 Uhr', status: 'ordered' },
      { id: 'ord-004', projectName: 'Gewerbehalle Ost', employeeName: 'Laura Fischer', material: 'Kies 16/32', quantity: 20, unit: 'to', requestedDate: '2026-09-01', createdDate: '2026-08-30', comment: '', status: 'delivered' },
      { id: 'ord-005', projectName: 'Gewerbehalle Ost', employeeName: 'Laura Fischer', material: 'Schotter 0/45', quantity: 15, unit: 'to', requestedDate: '2026-08-25', createdDate: '2026-08-23', comment: '', status: 'completed' },
    ],
    tasks: [
      { id: 'task-001', projectName: 'Solar Park Nord', title: 'Wechselrichter-Rahmen montieren', description: 'Rahmen laut Planblatt E-04 an der Südwand montieren.', date: '2026-09-06', appointment: '2026-09-06T10:30', priority: 'high', status: 'open', assignedEmployeeIds: ['demo-emp-001', 'demo-emp-002'], adminNote: 'Vor dem Bohren mit der Bauleitung abstimmen.' },
      { id: 'task-002', projectName: 'Solar Park Nord', title: 'Kabeltrasse dokumentieren', description: 'Fotos der Trasse vor dem Verfüllen.', date: '2026-09-06', appointment: '', priority: 'normal', status: 'inProgress', assignedEmployeeIds: ['demo-emp-002'], adminNote: '' },
      { id: 'task-003', projectName: 'Wohnanlage Südtor', title: 'Pflasterfläche aufmessen', description: 'Aufmaß für die Abrechnung erstellen.', date: '2026-09-04', appointment: '2026-09-07T08:00', priority: 'normal', status: 'open', assignedEmployeeIds: ['demo-emp-001'], adminNote: '' },
      { id: 'task-004', projectName: 'Gewerbehalle Ost', title: 'Baustelle räumen', description: 'Restmaterial abtransportieren.', date: '2026-08-28', appointment: '', priority: 'low', status: 'completed', assignedEmployeeIds: ['demo-emp-004'], adminNote: '' },
    ],
    corrections: [
      { id: 'cor-001', employeeName: 'Anna Schmidt', projectName: 'Solar Park Nord', entryDate: '2026-09-05', requestedAt: '2026-09-06', reason: 'Pause war 30 statt 60 Minuten.', resolved: false },
      { id: 'cor-002', employeeName: 'Max Müller', projectName: 'Wohnanlage Südtor', entryDate: '2026-09-02', requestedAt: '2026-09-03', reason: 'Ende 17:00 statt 16:00.', resolved: true },
    ],
    notes: [
      { id: 'note-001', projectName: 'Solar Park Nord', authorName: 'Max Müller', createdAt: '2026-09-06', text: 'Untergrund weicher als erwartet — zusätzliche Verdichtung nötig.', internalOnly: false, isNew: true },
      { id: 'note-002', projectName: 'Wohnanlage Südtor', authorName: 'Büro · Anna Keller', createdAt: '2026-09-06', text: 'Zufahrt bis 09:00 freihalten.', internalOnly: false, isNew: true },
      { id: 'note-003', projectName: 'Gewerbehalle Ost', authorName: 'Büro', createdAt: '2026-08-31', text: 'Interne Kalkulation knapp — keine Zusatzarbeiten ohne Rücksprache.', internalOnly: true, isNew: false },
    ],
  };
}
