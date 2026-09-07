'use client';

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import type { TemplateCategory, TextTemplate } from '@/lib/templates/types';

interface TextTemplateListProps {
  category: TemplateCategory;
  templates: TextTemplate[];
  onAdd: (input: { category: TemplateCategory; text: string; group: string }) => void;
  onUpdate: (
    id: string,
    changes: Partial<Pick<TextTemplate, 'text' | 'group' | 'isActive'>>,
  ) => void;
  onDelete: (id: string) => void;
}

/** Prepared texts of one category (requirement 54). */
export default function TextTemplateList({
  category,
  templates,
  onAdd,
  onUpdate,
  onDelete,
}: TextTemplateListProps) {
  const { t } = useLanguage();
  const [newText, setNewText] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const activeCount = templates.filter((tpl) => tpl.isActive).length;

  const submitNew = (e: React.FormEvent) => {
    e.preventDefault();
    const value = newText.trim();
    if (!value) return;
    onAdd({ category, text: value, group: newGroup.trim() });
    setNewText('');
  };

  const startEdit = (template: TextTemplate) => {
    setEditingId(template.id);
    setEditText(template.text);
  };

  const commitEdit = () => {
    if (!editingId) return;
    const value = editText.trim();
    if (value) onUpdate(editingId, { text: value });
    setEditingId(null);
  };

  return (
    <div className="space-y-5">
      <form
        onSubmit={submitNew}
        className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end"
      >
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            {t('templates.textLabel')}
          </label>
          <input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder={t('templates.textPlaceholder')}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-power-500"
          />
        </div>
        <div className="sm:w-56">
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            {t('templates.groupLabel')}
          </label>
          <input
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
            placeholder={t('templates.groupPlaceholder')}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-green-power-500"
          />
        </div>
        <button
          type="submit"
          disabled={!newText.trim()}
          className="px-4 py-2 bg-green-power-600 text-white text-sm font-medium rounded-lg hover:bg-green-power-700 disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {t('templates.addText')}
        </button>
      </form>

      {templates.length === 0 ? (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-lg p-8 text-center">
          <p className="text-sm font-medium text-gray-700">
            {t('templates.empty')}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {t('templates.emptyHint')}
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-500">
            {t('templates.countActive')
              .replace('{active}', String(activeCount))
              .replace('{total}', String(templates.length))}
            {' · '}
            {t('templates.inactiveHint')}
          </p>

          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
            {templates.map((template) => (
              <div
                key={template.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <div className="flex-1 min-w-[12rem]">
                  {editingId === template.id ? (
                    <input
                      autoFocus
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEdit();
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="w-full px-2 py-1 border border-green-power-400 rounded text-sm"
                    />
                  ) : (
                    <p
                      className={`text-sm ${
                        template.isActive ? 'text-gray-900' : 'text-gray-400'
                      }`}
                    >
                      {template.text}
                    </p>
                  )}
                  {template.group && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {template.group}
                    </p>
                  )}
                </div>

                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    template.isActive
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {template.isActive
                    ? t('templates.active')
                    : t('templates.inactive')}
                </span>

                <div className="flex items-center gap-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => startEdit(template)}
                    className="text-xs font-medium text-gray-600 hover:text-gray-900"
                  >
                    {t('templates.edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdate(template.id, { isActive: !template.isActive })
                    }
                    className="text-xs font-medium text-green-power-700 hover:text-green-power-800"
                  >
                    {template.isActive
                      ? t('templates.deactivate')
                      : t('templates.activate')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(t('templates.deleteConfirm'))) {
                        onDelete(template.id);
                      }
                    }}
                    className="text-xs font-medium text-red-600 hover:text-red-700"
                  >
                    {t('templates.delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
