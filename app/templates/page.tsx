'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import TextTemplateList from '@/components/templates/TextTemplateList';
import WorkingTimeModelList from '@/components/templates/WorkingTimeModelList';
import { useLanguage } from '@/contexts/LanguageContext';
import type { WorkingTimeModel } from '@/lib/employees/types';
import {
  addTextTemplate,
  addWorkingTimeModel,
  deleteTextTemplate,
  deleteWorkingTimeModel,
  getTextTemplates,
  getWorkingTimeModels,
  subscribeTemplates,
  updateTextTemplate,
} from '@/lib/templates/templatesStore';
import {
  TEMPLATES_TABS,
  type TemplateCategory,
  type TemplatesTab,
  type TextTemplate,
} from '@/lib/templates/types';

const TAB_LABEL: Record<TemplatesTab, string> = {
  work: 'templates.tabWork',
  report: 'templates.tabReport',
  material: 'templates.tabMaterial',
  order: 'templates.tabOrder',
  documentation: 'templates.tabDocumentation',
  workingTime: 'templates.tabWorkingTime',
};

export default function TemplatesPage() {
  const { t } = useLanguage();
  return (
    <ProtectedRoute>
      <AdminLayout title={t('templates.title')}>
        <TemplatesContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

function TemplatesContent() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TemplatesTab>('work');
  const [texts, setTexts] = useState<TextTemplate[]>([]);
  const [models, setModels] = useState<WorkingTimeModel[]>([]);

  // One subscription feeds both panels; the store notifies after every write.
  useEffect(() => {
    return subscribeTemplates(() => {
      if (activeTab === 'workingTime') {
        setModels(getWorkingTimeModels());
      } else {
        setTexts(getTextTemplates(activeTab as TemplateCategory));
      }
    });
  }, [activeTab]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          {t('templates.title')}
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          {t('templates.description')}
        </p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg border border-gray-200 p-0.5 bg-white">
        {TEMPLATES_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === tab
                ? 'bg-green-power-600 text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t(TAB_LABEL[tab])}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        {activeTab === 'workingTime' ? (
          <WorkingTimeModelList
            models={models}
            onAdd={(model) => addWorkingTimeModel(model)}
            onDelete={(id) => deleteWorkingTimeModel(id)}
          />
        ) : (
          <TextTemplateList
            category={activeTab as TemplateCategory}
            templates={texts}
            onAdd={(input) => addTextTemplate(input)}
            onUpdate={(id, changes) => updateTextTemplate(id, changes)}
            onDelete={(id) => deleteTextTemplate(id)}
          />
        )}
      </div>
    </div>
  );
}
