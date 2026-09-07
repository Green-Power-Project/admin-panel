import { DEFAULT_WORKING_TIME_MODELS } from '@/lib/employees/types';
import type { TemplateCategory, TemplatesSnapshot, TextTemplate } from './types';

let sequence = 0;

function text(
  category: TemplateCategory,
  group: string,
  value: string,
): TextTemplate {
  sequence += 1;
  return {
    id: `demo-tpl-${String(sequence).padStart(3, '0')}`,
    category,
    group,
    text: value,
    isActive: true,
    sortOrder: sequence,
    createdAt: new Date('2026-01-15'),
    updatedAt: new Date('2026-01-15'),
  };
}

/** Seeded texts mirroring the examples in requirements 13 and 54. */
export function createTemplatesSnapshot(): TemplatesSnapshot {
  sequence = 0;

  return {
    texts: [
      // Work texts (requirement 13B).
      text('work', 'Allgemein', 'Baustelle eingerichtet'),
      text('work', 'Allgemein', 'Unterbau hergestellt'),
      text('work', 'Allgemein', 'Splitt eingebaut'),
      text('work', 'Allgemein', 'Pflaster verlegt'),
      text('work', 'Allgemein', 'Material transportiert'),
      text('work', 'Allgemein', 'Zusatzarbeiten ausgeführt'),
      text('work', 'Erdarbeiten', 'Aushub durchgeführt'),
      text('work', 'Erdarbeiten', 'Boden verdichtet'),

      // Report texts.
      text('report', 'Rapport', 'Regie nach Aufwand'),
      text('report', 'Rapport', 'Zusatzleistung auf Anweisung Bauleitung'),
      text('report', 'Rapport', 'Behinderung durch Vorgewerk'),
      text('report', 'Rapport', 'Wartezeit Materiallieferung'),

      // Material texts.
      text('material', 'Schüttgut', 'Kies 16/32'),
      text('material', 'Schüttgut', 'Splitt 2/5'),
      text('material', 'Schüttgut', 'Schotter 0/45'),
      text('material', 'Beton', 'Transportbeton C25/30'),

      // Order texts (used by the app's material order flow).
      text('order', 'Bestellung', 'Lieferung bis 07:00 Uhr auf die Baustelle'),
      text('order', 'Bestellung', 'Abladen mit Kran erforderlich'),
      text('order', 'Bestellung', 'Bitte Lieferschein an Polier übergeben'),

      // Documentation texts.
      text('documentation', 'Fotodokumentation', 'Zustand vor Beginn'),
      text('documentation', 'Fotodokumentation', 'Zwischenstand'),
      text('documentation', 'Fotodokumentation', 'Fertigstellung'),
      text('documentation', 'Mängel', 'Schaden dokumentiert'),
    ],
    workingTimeModels: DEFAULT_WORKING_TIME_MODELS.map((model) => ({
      ...model,
      workingDays: [...model.workingDays],
      breakRules: model.breakRules.map((rule) => ({ ...rule })),
    })),
  };
}
