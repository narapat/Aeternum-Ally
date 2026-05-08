/**
 * AdminApp.tsx
 *
 * Root component for the Platform Admin portal rendered at /admin.
 * Manages the admin authentication lifecycle:
 *   - No session → show AdminLoginScreen
 *   - Valid session → show AdminShell
 *
 * The session is persisted in localStorage under 'aeternum_admin_session'
 * as { token: string, email: string, expiresAt: number }.
 * Token is the raw Supabase access_token; it expires after 1 hour.
 */

import React, { useState, useEffect } from 'react';
import AdminLoginScreen from './components/admin/AdminLoginScreen';
import AdminShell from './components/admin/AdminShell';
import { supabase } from './lib/supabaseClient';
import { Loader2 } from 'lucide-react';

const SESSION_KEY = 'aeternum_admin_session';

interface AdminSession {
  token:     string;
  email:     string;
  expiresAt: number; // epoch ms
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
  const session: AdminSession = {
    token,
    email,
    expiresAt: Date.now() + 55 * 60 * 1000, // 55 min (Supabase tokens expire at 60)
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

// ---------------------------------------------------------------------------

const AdminApp: React.FC = () => {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [booting, setBooting] = useState(true);

  // On mount, restore session from localStorage if still valid
  useEffect(() => {
    const s = loadSession();
    setSession(s);
    setBooting(false);
  }, []);

  const handleLoginSuccess = (token: string, email: string) => {
    saveSession(token, email);
    setSession({ token, email, expiresAt: Date.now() + 55 * 60 * 1000 });
  };

  const handleSignOut = async () => {
    clearSession();
    setSession(null);
    await supabase.auth.signOut();
  };

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!session) {
    return <AdminLoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <AdminShell
      adminToken={session.token}
      adminEmail={session.email}
      onSignOut={handleSignOut}
    />
  );
};

export default AdminApp;
