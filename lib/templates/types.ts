import type { WorkingTimeModel } from '@/lib/employees/types';

/**
 * The text template families the admin prepares (requirement 54), so the
 * employee only has to pick one on site.
 */
export const TEMPLATE_CATEGORIES = [
  'work',
  'report',
  'material',
  'order',
  'documentation',
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

/** One prepared text offered to the employee app. */
export interface TextTemplate {
  id: string;
  category: TemplateCategory;
  /** What the employee sees in the picker. */
  text: string;
  /** Optional grouping inside a category, e.g. "Paving". */
  group: string;
  /** Inactive templates stay on file but are not offered in the app. */
  isActive: boolean;
  /** Lower sorts first inside a category. */
  sortOrder: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type TemplatesTab = TemplateCategory | 'workingTime';

export const TEMPLATES_TABS: TemplatesTab[] = [
  ...TEMPLATE_CATEGORIES,
  'workingTime',
];

export interface TemplatesSnapshot {
  texts: TextTemplate[];
  /** Built-ins plus any model the admin added (requirement 53). */
  workingTimeModels: WorkingTimeModel[];
}
