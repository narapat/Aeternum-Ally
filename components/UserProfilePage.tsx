import React, { useState, useEffect, useCallback } from 'react';
import { User, Phone, Smartphone, FileText, Save, Loader2, CheckCircle, AlertCircle, Mail } from 'lucide-react';
import { fetchUserProfile, upsertUserProfile } from '../services/dbService';

interface Props {
  userId: string;
  userEmail: string;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const UserProfilePage: React.FC<Props> = ({ userId, userEmail }) => {
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone]     = useState('');
  const [mobile, setMobile]   = useState('');
  const [notes, setNotes]     = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Load profile on mount
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchUserProfile(userId)
      .then(profile => {
        if (cancelled) return;
        if (profile) {
          setDisplayName(profile.display_name ?? '');
          setPhone(profile.phone ?? '');
          setMobile(profile.mobile ?? '');
          setNotes(profile.notes ?? '');
        }
      })
      .catch(err => {
        if (!cancelled) setErrorMessage(err?.message ?? 'Failed to load profile');
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  const handleSave = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus('saving');
    setErrorMessage('');
    try {
      await upsertUserProfile(userId, {
        display_name: displayName.trim() || null,
        phone: phone.trim() || null,
        mobile: mobile.trim() || null,
        notes: notes.trim() || null,
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (err: any) {
      setSaveStatus('error');
      setErrorMessage(err?.message ?? 'Failed to save profile');
    }
  }, [userId, displayName, phone, mobile, notes]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading profile…
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto animate-in fade-in duration-500">
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-14 h-14 rounded-full bg-esg-700 flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
            {(displayName || userEmail || '?').charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
              {displayName || userEmail}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{userEmail}</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Basic Info card */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
            <User className="w-4 h-4 text-esg-500" />
            <h2 className="font-semibold text-slate-800 dark:text-white text-sm">Basic Information</h2>
          </div>
          <div className="p-6 space-y-4">
            {/* Display Name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Your full name"
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-esg-500 focus:border-transparent outline-none text-sm transition-colors"
              />
            </div>

            {/* Email — read-only */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Email Address
                <span className="ml-2 text-xs text-slate-400 font-normal">(managed by your account)</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="email"
                  value={userEmail}
                  readOnly
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-500 text-sm cursor-default select-all"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Contact Details card */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
            <Phone className="w-4 h-4 text-esg-500" />
            <h2 className="font-semibold text-slate-800 dark:text-white text-sm">Contact Details</h2>
          </div>
          <div className="p-6 space-y-4">
            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Phone
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+66 2 xxx xxxx"
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-esg-500 focus:border-transparent outline-none text-sm transition-colors"
                />
              </div>
            </div>

            {/* Mobile */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Mobile
              </label>
              <div className="relative">
                <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="tel"
                  value={mobile}
                  onChange={e => setMobile(e.target.value)}
                  placeholder="+66 8x xxx xxxx"
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-esg-500 focus:border-transparent outline-none text-sm transition-colors"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Notes card */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
            <FileText className="w-4 h-4 text-esg-500" />
            <h2 className="font-semibold text-slate-800 dark:text-white text-sm">Notes</h2>
          </div>
          <div className="p-6">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={4}
              placeholder="Any notes about yourself or your role…"
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-esg-500 focus:border-transparent outline-none text-sm transition-colors resize-none"
            />
          </div>
        </div>

        {/* Save bar */}
        {errorMessage && saveStatus === 'error' && (
          <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-4 py-3 rounded-lg border border-red-200 dark:border-red-800">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {errorMessage}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1.5 text-sm text-esg-600 dark:text-esg-400">
              <CheckCircle className="w-4 h-4" /> Saved
            </span>
          )}
          <button
            type="submit"
            disabled={saveStatus === 'saving'}
            className="flex items-center gap-2 px-5 py-2.5 bg-esg-600 text-white rounded-lg text-sm font-medium hover:bg-esg-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {saveStatus === 'saving' ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
            ) : (
              <><Save className="w-4 h-4" /> Save Profile</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default UserProfilePage;
