'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useColdTranslation } from '@/components/providers/cold-language-provider';

export default function LanguagePage() {
  const { data: session, update } = useSession();
  const { language, t } = useColdTranslation();
  const [selectedLanguage, setSelectedLanguage] = useState<'en' | 'gu'>(language);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coldLanguage: selectedLanguage }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to update language');
      }

      // Force NextAuth session refresh so the new language token is picked up
      await update({ coldLanguage: selectedLanguage });
      
      // We do a hard refresh to ensure all server components get the new session language
      window.location.reload();
      
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: t('language.error') });
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="rounded-xl bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{t('language.title')}</h1>
          <p className="text-slate-600">{t('language.description')}</p>
        </div>

        {message && (
          <div className={`mb-4 rounded-md border p-4 text-sm ${
            message.type === 'success' 
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700' 
              : 'border-red-200 bg-red-50 text-red-700'
          }`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSave} className="max-w-md">
          <div className="space-y-4">
            <label className="flex items-center space-x-3 cursor-pointer p-4 border rounded-lg hover:bg-slate-50 transition-colors">
              <input
                type="radio"
                name="language"
                value="en"
                checked={selectedLanguage === 'en'}
                onChange={(e) => setSelectedLanguage('en')}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500"
              />
              <span className="font-medium text-slate-900">{t('language.english')}</span>
            </label>

            <label className="flex items-center space-x-3 cursor-pointer p-4 border rounded-lg hover:bg-slate-50 transition-colors">
              <input
                type="radio"
                name="language"
                value="gu"
                checked={selectedLanguage === 'gu'}
                onChange={(e) => setSelectedLanguage('gu')}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500"
              />
              <span className="font-medium text-slate-900">{t('language.gujarati')}</span>
            </label>
          </div>

          <div className="mt-8">
            <button
              type="submit"
              disabled={saving || selectedLanguage === language}
              className="inline-flex items-center justify-center rounded-md bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {saving ? t('language.saving') : t('language.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
