/**
 * AdminApp.tsx
 *
 * Root component for the Platform Admin portal rendered at /admin.
 * Manages the admin authentication lifecycle:
 *   - No session → show AdminLoginScreen (magic link form)
 *   - Magic link callback (URL hash has access_token) → verify admin → enter shell
 *   - Valid stored session → show AdminShell directly
 *
 * Session persisted in localStorage under 'aeternum_admin_session':
 *   { token: string, email: string, expiresAt: number }
 */

import React, { useState, useEffect } from 'react';
import AdminLoginScreen from './components/admin/AdminLoginScreen';
import AdminShell from './components/admin/AdminShell';
import { supabase } from './lib/supabaseClient';
import { Loader2, ShieldCheck, AlertCircle } from 'lucide-react';

const SESSION_KEY = 'aeternum_admin_session';

interface AdminSession {
  token:     string;
  email:     string;
  expiresAt: number;
}

function loadSession(): AdminSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as AdminSession;
    if (Date.now() >= s.expiresAt) { localStorage.removeItem(SESSION_KEY); return null; }
    return s;
  } catch { return null; }
}

function saveSession(token: string, email: string) {
  const s: AdminSession = { token, email, expiresAt: Date.now() + 55 * 60 * 1000 };
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

function clearSession() { localStorage.removeItem(SESSION_KEY); }

// ---------------------------------------------------------------------------

const AdminApp: React.FC = () => {
  const [session, setSession]       = useState<AdminSession | null>(null);
  const [booting, setBooting]       = useState(true);
  const [bootError, setBootError]   = useState('');

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      // 1. Check stored session first
      const stored = loadSession();
      if (stored) {
        if (!cancelled) { setSession(stored); setBooting(false); }
        return;
      }

      // 2. Check if Supabase just redirected back with a magic-link token
      //    Supabase puts #access_token=...&type=magiclink in the URL hash
      const { data: { session: sbSession } } = await supabase.auth.getSession();

      if (sbSession?.access_token) {
        // Verify the user is an active platform admin
        try {
          const res = await fetch('/.netlify/functions/admin', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${sbSession.access_token}`,
            },
            body: JSON.stringify({ action: 'verify_admin' }),
          });
          const json = await res.json();

          if (!res.ok) {
            await supabase.auth.signOut();
            if (!cancelled) {
              setBootError(json.error ?? 'Not authorized as platform admin');
              setBooting(false);
            }
            return;
          }

          // Clean the hash from the URL so tokens don't sit in the address bar
          window.history.replaceState(null, '', '/admin');

          const newSession: AdminSession = {
            token:     json.token,   // custom admin JWT returned by verify_admin
            email:     json.email,
            expiresAt: Date.now() + 55 * 60 * 1000,
          };
          saveSession(newSession.token, newSession.email);
          if (!cancelled) { setSession(newSession); setBooting(false); }
        } catch (err: any) {
          if (!cancelled) {
            setBootError(err?.message ?? 'Verification failed');
            setBooting(false);
          }
        }
        return;
      }

      // 3. No session, no magic-link callback → show login screen
      if (!cancelled) setBooting(false);
    };

    boot();
    return () => { cancelled = true; };
  }, []);

  const handleLoginSuccess = (token: string, email: string) => {
    saveSession(token, email);
    setSession({ token, email, expiresAt: Date.now() + 55 * 60 * 1000 });
  };

  const handleSignOut = () => {
    clearSession();
    // Silently attempt Supabase sign-out (may be a no-op for password-only logins)
    supabase.auth.signOut().catch(() => {});
    // Hard redirect ensures clean state regardless of Supabase session presence
    window.location.href = '/admin';
  };

  // ── Booting ──
  if (booting) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-950">
        <div className="w-12 h-12 rounded-2xl bg-esg-700 flex items-center justify-center">
          <ShieldCheck className="w-6 h-6 text-white" />
        </div>
        <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
        <p className="text-xs text-slate-500">Verifying admin access…</p>
      </div>
    );
  }

  // ── Boot error (e.g. magic link but not an admin) ──
  if (bootError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-4">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
          <div>
            <p className="text-white font-semibold">Access Denied</p>
            <p className="text-sm text-slate-400 mt-1">{bootError}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 text-sm bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  // ── No session → show login ──
  if (!session) {
    return <AdminLoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  // ── Authenticated ──
  return (
    <AdminShell
      adminToken={session.token}
      adminEmail={session.email}
      onSignOut={handleSignOut}
    />
  );
};

export default AdminApp;
