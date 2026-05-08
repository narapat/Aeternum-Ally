/**
 * ResetPasswordModal
 *
 * Shown when Supabase fires a PASSWORD_RECOVERY auth event (user clicked
 * the reset link in their email). Collects and confirms a new password,
 * calls supabase.auth.updateUser, then invokes onDone so the caller can
 * clean up (e.g. sign the user out and redirect to login).
 */

import React, { useState } from 'react';
import { Lock, Eye, EyeOff, Loader2, CheckCircle, AlertCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface Props {
  onDone: () => void;
}

const ResetPasswordModal: React.FC<Props> = ({ onDone }) => {
  const { updatePassword, signOut } = useAuth();
  const [password,    setPassword]    = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [showPw,      setShowPw]      = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [done,        setDone]        = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }

    setLoading(true);
    const { error: err } = await updatePassword(password);
    setLoading(false);

    if (err) { setError(err); return; }
    setDone(true);
  };

  const handleFinish = async () => {
    await signOut();
    onDone();
  };

  return (
    /* Full-screen backdrop */
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#004d4d' }}>
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white">Set a new password</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Choose a strong password for your account.</p>
          </div>
        </div>

        {done ? (
          /* Success state */
          <div className="space-y-4 text-center py-2">
            <CheckCircle className="w-12 h-12 mx-auto text-emerald-500" />
            <div>
              <p className="font-semibold text-slate-800 dark:text-white">Password updated!</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">You'll be signed out and redirected to the login screen.</p>
            </div>
            <button
              onClick={handleFinish}
              className="w-full py-2.5 rounded-lg font-semibold text-sm transition-colors"
              style={{ backgroundColor: '#ccff00', color: '#004d4d' }}
            >
              Back to Sign In
            </button>
          </div>
        ) : (
          /* Password form */
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* New password */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">New password</label>
              <div className="relative">
                <Lock className="absolute top-3 left-3 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="At least 6 characters"
                  className="w-full pl-9 pr-10 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#004d4d] text-sm"
                />
                <button type="button" tabIndex={-1} onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm password */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Confirm new password</label>
              <div className="relative">
                <Lock className="absolute top-3 left-3 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  placeholder="Repeat new password"
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#004d4d] text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !password || !confirm}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#ccff00', color: '#004d4d' }}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Update password
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPasswordModal;
