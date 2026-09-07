'use client';

import type { WorkingTimeModel } from '@/lib/employees/types';
import { createTemplatesSnapshot } from './demoData';
import type { TemplateCategory, TemplatesSnapshot, TextTemplate } from './types';

const STORAGE_KEY = 'green-power-templates-demo-v1';

type StoreListener = () => void;

let snapshot: TemplatesSnapshot | null = null;
const listeners = new Set<StoreListener>();

function reviveDates(data: TemplatesSnapshot): TemplatesSnapshot {
  return {
    ...data,
    texts: data.texts.map((template) => ({
      ...template,
      createdAt: template.createdAt ? new Date(template.createdAt) : undefined,
      updatedAt: template.updatedAt ? new Date(template.updatedAt) : undefined,
    })),
  };
}

function loadSnapshot(): TemplatesSnapshot {
  if (snapshot) return snapshot;

  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        snapshot = reviveDates(JSON.parse(raw) as TemplatesSnapshot);
        return snapshot;
      }
    } catch (error) {
      console.warn('templates store load failed:', error);
    }
  }

  snapshot = createTemplatesSnapshot();
  persistSnapshot();
  return snapshot;
}

function persistSnapshot() {
  if (!snapshot || typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.warn('templates store persist failed:', error);
  }
}

function notify() {
  persistSnapshot();
  listeners.forEach((listener) => listener());
}

export function subscribeTemplates(listener: StoreListener): () => void {
  loadSnapshot();
  listeners.add(listener);
  listener();
  return () => listeners.delete(listener);
}

export function resetTemplates(): void {
  snapshot = createTemplatesSnapshot();
  notify();
}

/** Texts of one category, active first, in the admin's chosen order. */
export function getTextTemplates(category: TemplateCategory): TextTemplate[] {
  return loadSnapshot()
    .texts.filter((template) => template.category === category)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** What the employee app would offer: active templates only. */
export function getActiveTextTemplates(
  category: TemplateCategory,
): TextTemplate[] {
  return getTextTemplates(category).filter((template) => template.isActive);
}

export function addTextTemplate(input: {
  category: TemplateCategory;
  text: string;
  group?: string;
}): string {
  const store = loadSnapshot();
  const id = `tpl-${Date.now()}`;
  const now = new Date();
  const maxOrder = store.texts.reduce(
    (max, template) => Math.max(max, template.sortOrder),
    0,
  );

  store.texts.push({
    id,
    category: input.category,
    text: input.text.trim(),
    group: (input.group ?? '').trim(),
    isActive: true,
    sortOrder: maxOrder + 1,
    createdAt: now,
    updatedAt: now,
  });
  notify();
  return id;
}

export function updateTextTemplate(
  id: string,
  changes: Partial<Pick<TextTemplate, 'text' | 'group' | 'isActive'>>,
): boolean {
  const store = loadSnapshot();
  const template = store.texts.find((entry) => entry.id === id);
  if (!template) return false;

  if (changes.text !== undefined) template.text = changes.text.trim();
  if (changes.group !== undefined) template.group = changes.group.trim();
  if (changes.isActive !== undefined) template.isActive = changes.isActive;
  template.updatedAt = new Date();
  notify();
  return true;
}

export function deleteTextTemplate(id: string): boolean {
  const store = loadSnapshot();
  const before = store.texts.length;
  store.texts = store.texts.filter((template) => template.id !== id);
  if (store.texts.length === before) return false;
  notify();
  return true;
}

export function getWorkingTimeModels(): WorkingTimeModel[] {
  return [...loadSnapshot().workingTimeModels];
}

/** Admin-created working-time template (closes requirement 53). */
export function addWorkingTimeModel(
  model: Omit<WorkingTimeModel, 'id' | 'isCustom'>,
): string {
  const store = loadSnapshot();
  const id = `wtm-${Date.now()}`;
  store.workingTimeModels.push({
    ...model,
    id,
    isCustom: true,
    workingDays: [...model.workingDays],
    breakRules: model.breakRules.map((rule) => ({ ...rule })),
  });
  notify();
  return id;
}

export function updateWorkingTimeModel(
  id: string,
  changes: Partial<Omit<WorkingTimeModel, 'id' | 'isCustom'>>,
): boolean {
  const store = loadSnapshot();
  const index = store.workingTimeModels.findIndex((model) => model.id === id);
  if (index < 0) return false;
  store.workingTimeModels[index] = {
    ...store.workingTimeModels[index],
    ...changes,
  };
  notify();
  return true;
}

/** Built-in models cannot be deleted — employees may be sitting on them. */
export function deleteWorkingTimeModel(id: string): boolean {
  const store = loadSnapshot();
  const model = store.workingTimeModels.find((entry) => entry.id === id);
  if (!model || !model.isCustom) return false;
  store.workingTimeModels = store.workingTimeModels.filter(
    (entry) => entry.id !== id,
  );
  notify();
  return true;
}
