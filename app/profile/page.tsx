'use client';

import { useState, useEffect, FormEvent } from 'react';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import AdminLayout from '@/components/AdminLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { getContactSettings, setContactSettings, type ContactSettingsData } from '@/lib/contactSettings';

export default function ProfilePage() {
  const { t } = useLanguage();
  return (
    <ProtectedRoute>
      <AdminLayout title={t('profile.title')}>
        <ProfileContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}

function ProfileContent() {
  const { currentUser } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const [name, setName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactWhatsApp, setContactWhatsApp] = useState('');
  const [contactWebsite, setContactWebsite] = useState('');
  const [savingContact, setSavingContact] = useState(false);

  useEffect(() => {
    loadProfile();
  }, [currentUser]);

  async function loadProfile() {
    if (!currentUser || !db) return;
    const dbInstance = db;
    setLoading(true);
    try {
      const adminDoc = await getDoc(doc(dbInstance, 'admins', currentUser.uid));
      if (adminDoc.exists()) {
        const data = adminDoc.data();
        setName(data.name || '');
      }
      const contact = await getContactSettings(dbInstance);
      setContactPhone(contact.phone ?? '');
      setContactEmail(contact.email ?? '');
      setContactWhatsApp(contact.whatsApp ?? '');
      setContactWebsite(contact.website ?? '');
    } catch (err) {
      console.error('Error loading profile:', err);
      setError(t('profile.loadingProfile'));
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveName(e: FormEvent) {
    e.preventDefault();
    if (!currentUser || !db) return;
    const dbInstance = db;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const adminDocRef = doc(dbInstance, 'admins', currentUser.uid);
      const adminDoc = await getDoc(adminDocRef);
      const displayName = name.trim() ? name.trim().charAt(0).toUpperCase() + name.trim().slice(1).toLowerCase() : '';
      if (adminDoc.exists()) {
        await updateDoc(adminDocRef, { name: displayName, updatedAt: new Date() });
      } else {
        await setDoc(adminDocRef, { name: displayName, email: currentUser.email || '', createdAt: new Date(), updatedAt: new Date() });
      }
      setSuccess(t('profile.nameUpdated'));
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: unknown) {
      console.error('Error updating name:', err);
      setError(err instanceof Error ? err.message : t('profile.nameUpdateFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveContact(e: FormEvent) {
    e.preventDefault();
    if (!db) return;
    setSavingContact(true);
    setError('');
    setSuccess('');
    try {
      await setContactSettings(db, { phone: contactPhone, email: contactEmail, whatsApp: contactWhatsApp, website: contactWebsite });
      setSuccess(t('contactSettings.saved'));
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Error saving contact settings:', err);
      setError(t('contactSettings.saveFailed'));
    } finally {
      setSavingContact(false);
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (!currentUser || !auth) {
      setError('Authentication not initialized');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    if (!currentPassword) {
      setError('Current password is required');
      setSaving(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('profile.passwordMismatch'));
      setSaving(false);
      return;
    }
    if (newPassword.length < 6) {
      setError(t('profile.passwordTooShort'));
      setSaving(false);
      return;
    }
    try {
      const authUser = auth.currentUser;
      if (!authUser) throw new Error('No user signed in');
      const credential = EmailAuthProvider.credential(authUser.email || '', currentPassword);
      await reauthenticateWithCredential(authUser, credential);
      await updatePassword(authUser, newPassword);
      setSuccess(t('profile.passwordUpdated'));
      setShowPasswordSection(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: unknown) {
      const ex = err as { code?: string; message?: string };
      if (ex.code === 'auth/wrong-password') setError(t('profile.invalidPassword'));
      else if (ex.code === 'auth/weak-password') setError(t('profile.passwordTooShort'));
      else setError(ex.message || t('profile.passwordUpdateFailed'));
    } finally {
      setSaving(false);
    }
  }

  const togglePasswordSection = () => {
    setShowPasswordSection(!showPasswordSection);
    setError('');
    setSuccess('');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-4 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 animate-pulse"
            >
              <div className="h-6 w-24 rounded-full bg-gray-200" />
              <div className="h-3 w-40 rounded bg-gray-200" />
              <div className="h-3 w-32 rounded bg-gray-200" />
              <div className="h-3 w-28 rounded bg-gray-200" />
              <div className="h-3 w-32 rounded bg-gray-200" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const displayName = name || currentUser?.email?.split('@')[0] || 'Admin';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      {/* Hero identity strip */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-green-power-600 via-green-power-700 to-emerald-800 shadow-xl shadow-green-power-900/20 mb-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(255,255,255,0.15),transparent)]" />
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-green-power-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative px-6 sm:px-8 py-8 flex flex-col sm:flex-row sm:items-center gap-6">
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 rounded-2xl bg-white/95 shadow-lg flex items-center justify-center flex-shrink-0 ring-2 ring-white/50">
              <span className="text-3xl font-bold text-green-power-700">{initial}</span>
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{displayName}</h1>
              <p className="text-green-power-100 text-sm mt-0.5">{currentUser?.email}</p>
              <span className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-lg bg-white/20 text-white text-xs font-medium backdrop-blur-sm">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                {t('navigation.administrator')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {(error || success) && (
        <div
          className={`mb-6 flex items-start gap-3 rounded-xl px-4 py-3.5 text-sm shadow-sm ${
            error
              ? 'bg-red-50 text-red-800 border border-red-200/80'
              : 'bg-emerald-50 text-emerald-800 border border-emerald-200/80'
          }`}
        >
          {error ? (
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          )}
          <p className="font-medium">{error || success}</p>
        </div>
      )}

      <div className="space-y-6">
        {/* Name card */}
        <section className="rounded-2xl border border-gray-200/80 bg-white shadow-sm shadow-gray-200/50 overflow-hidden transition-shadow hover:shadow-md">
          <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-power-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-green-power-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{t('profile.nameSection')}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{t('profile.nameDescription')}</p>
              </div>
            </div>
          </div>
          <form onSubmit={handleSaveName} className="p-6">
            <label htmlFor="name" className="sr-only">{t('common.name')}</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-green-power-500/40 focus:border-green-power-500 transition-all"
              placeholder={t('common.name')}
            />
            <div className="mt-4 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-green-power-600 to-green-power-700 hover:from-green-power-700 hover:to-green-power-800 focus:outline-none focus:ring-2 focus:ring-green-power-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-green-power-600/25 transition-all"
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {t('common.saving')}
                  </span>
                ) : (
                  t('profile.updateName')
                )}
              </button>
            </div>
          </form>
        </section>

        {/* Language card */}
        <section className="rounded-2xl border border-gray-200/80 bg-white shadow-sm shadow-gray-200/50 overflow-hidden transition-shadow hover:shadow-md">
          <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-violet-50 to-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m9 9a9 9 0 019-9" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{t('profile.language')}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{t('profile.languageDescription')}</p>
              </div>
            </div>
          </div>
          <div className="p-6 border-t border-violet-100/60">
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`inline-flex items-center gap-2.5 px-5 py-3 rounded-xl text-sm font-medium transition-all ${
                  language === 'en'
                    ? 'bg-green-power-600 text-white shadow-lg shadow-green-power-600/25'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                }`}
              >
                <span className="text-lg leading-none" aria-hidden>🇬🇧</span>
                <span>{t('profile.english')}</span>
              </button>
              <button
                type="button"
                onClick={() => setLanguage('de')}
                className={`inline-flex items-center gap-2.5 px-5 py-3 rounded-xl text-sm font-medium transition-all ${
                  language === 'de'
                    ? 'bg-green-power-600 text-white shadow-lg shadow-green-power-600/25'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                }`}
              >
                <span className="text-lg leading-none" aria-hidden>🇩🇪</span>
                <span>{t('profile.german')}</span>
              </button>
            </div>
          </div>
        </section>

        {/* Contact details card */}
        <section className="rounded-2xl border border-gray-200/80 bg-white shadow-sm shadow-gray-200/50 overflow-hidden transition-shadow hover:shadow-md">
          <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{t('contactSettings.title')}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{t('contactSettings.subtitle')}</p>
              </div>
            </div>
          </div>
          <form onSubmit={handleSaveContact} className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="contact-phone" className="block text-sm font-medium text-gray-700 mb-1.5">{t('contactSettings.phone')}</label>
                <input id="contact-phone" type="text" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder={t('contactSettings.phonePlaceholder')} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-green-power-500/40 focus:border-green-power-500 transition-all" />
              </div>
              <div>
                <label htmlFor="contact-email" className="block text-sm font-medium text-gray-700 mb-1.5">{t('contactSettings.email')}</label>
                <input id="contact-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder={t('contactSettings.emailPlaceholder')} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-green-power-500/40 focus:border-green-power-500 transition-all" />
              </div>
              <div>
                <label htmlFor="contact-whatsapp" className="block text-sm font-medium text-gray-700 mb-1.5">{t('contactSettings.whatsApp')}</label>
                <input id="contact-whatsapp" type="text" value={contactWhatsApp} onChange={(e) => setContactWhatsApp(e.target.value)} placeholder={t('contactSettings.whatsAppPlaceholder')} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-green-power-500/40 focus:border-green-power-500 transition-all" />
              </div>
              <div>
                <label htmlFor="contact-website" className="block text-sm font-medium text-gray-700 mb-1.5">{t('contactSettings.website')}</label>
                <input id="contact-website" type="url" value={contactWebsite} onChange={(e) => setContactWebsite(e.target.value)} placeholder={t('contactSettings.websitePlaceholder')} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-green-power-500/40 focus:border-green-power-500 transition-all" />
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button type="submit" disabled={savingContact} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-green-power-600 to-green-power-700 hover:from-green-power-700 hover:to-green-power-800 focus:outline-none focus:ring-2 focus:ring-green-power-500 focus:ring-offset-2 disabled:opacity-60 shadow-lg shadow-green-power-600/25 transition-all">
                {savingContact ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{t('common.saving')}</span> : t('contactSettings.save')}
              </button>
            </div>
          </form>
        </section>

        {/* Password card */}
        <section className="rounded-2xl border border-gray-200/80 bg-white shadow-sm shadow-gray-200/50 overflow-hidden transition-shadow hover:shadow-md">
          <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-amber-50/80 to-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{t('profile.passwordSection')}</h2>
                <p className="text-xs text-gray-500 mt-0.5">{t('profile.passwordDescription')}</p>
              </div>
            </div>
            <button type="button" onClick={togglePasswordSection} className="self-start sm:self-center px-4 py-2 rounded-xl text-sm font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 transition-colors">
              {showPasswordSection ? t('common.cancel') : t('profile.changePassword')}
            </button>
          </div>
          {showPasswordSection && (
            <form onSubmit={handleChangePassword} className="p-6 space-y-4 border-t border-gray-100 bg-gray-50/40">
              <div>
                <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-1.5">{t('profile.currentPassword')} *</label>
                <div className="relative">
                  <input id="currentPassword" type={showCurrentPassword ? 'text' : 'password'} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required placeholder={t('profile.currentPassword')} className="w-full px-4 py-2.5 pr-12 rounded-xl border border-gray-200 text-gray-900 focus:ring-2 focus:ring-green-power-500/40 focus:border-green-power-500 transition-all" />
                  <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors" aria-label={showCurrentPassword ? t('profile.hidePassword') : t('profile.showPassword')}>
                    {showCurrentPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1.5">{t('profile.newPassword')} *</label>
                <div className="relative">
                  <input id="newPassword" type={showNewPassword ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} placeholder={t('profile.newPassword')} className="w-full px-4 py-2.5 pr-12 rounded-xl border border-gray-200 text-gray-900 focus:ring-2 focus:ring-green-power-500/40 focus:border-green-power-500 transition-all" />
                  <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors" aria-label={showNewPassword ? t('profile.hidePassword') : t('profile.showPassword')}>
                    {showNewPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1.5">{t('profile.confirmPassword')} *</label>
                <div className="relative">
                  <input id="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} placeholder={t('profile.confirmPassword')} className="w-full px-4 py-2.5 pr-12 rounded-xl border border-gray-200 text-gray-900 focus:ring-2 focus:ring-green-power-500/40 focus:border-green-power-500 transition-all" />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors" aria-label={showConfirmPassword ? t('profile.hidePassword') : t('profile.showPassword')}>
                    {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-60 shadow-lg shadow-amber-600/25 transition-all">
                  {saving ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{t('common.saving')}</span> : t('profile.changePassword')}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}
