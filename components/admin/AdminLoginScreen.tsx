import React, { useState } from 'react';
import { Loader2, ShieldCheck, AlertCircle, Mail, CheckCircle, ExternalLink, Lock, Eye, EyeOff } from 'lucide-react';

interface Props {
  onLoginSuccess: (token: string, email: string) => void;
}

type Mode  = 'password' | 'magic_link';
type Stage = 'input' | 'submitting' | 'sent' | 'error';

const AdminLoginScreen: React.FC<Props> = ({ onLoginSuccess }) => {
  const [mode, setMode]         = useState<Mode>('password');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [stage, setStage]         = useState<Stage>('input');
  const [errorMsg, setError]      = useState('');
  const [devLink, setDevLink]     = useState<string | null>(null);
  const [emailErr, setEmailErr]   = useState<string | null>(null);

  // ── Password login (bootstrap: table must be empty) ──────────────────────
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setStage('submitting');

    try {
      const res = await fetch('/.netlify/functions/admin', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'admin_login', email: email.trim(), password }),
      });

      const json = await res.json();

      if (!res.ok) {
        // Server returns 403 when the table already has admins
        if (res.status === 403) {
          setError(json.error ?? 'Admin accounts already exist.');
          // Auto-switch to magic link so the user knows what to do next
          setMode('magic_link');
          setStage('error');
        } else {
          throw new Error(json.error ?? 'Login failed');
        }
        return;
      }

      // Success — exchange token with parent
      onLoginSuccess(json.token, json.email);
    } catch (err: any) {
      setError(err?.message ?? 'Login failed');
      setStage('error');
    }
  };

  // ── Magic-link request (normal mode: table has rows) ─────────────────────
  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setDevLink(null);
    setStage('submitting');

    try {
      const res = await fetch('/.netlify/functions/admin', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'request_admin_magic_link', email: email.trim() }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to send link');

      // dev_link is returned when Resend is not set OR when email sending fails
      if (json.dev_link) setDevLink(json.dev_link);
      if (json.email_error) setEmailErr(json.email_error);

      setStage('sent');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to send magic link');
      setStage('error');
    }
  };

  const handleReset = () => { setStage('input'); setError(''); setDevLink(null); setEmailErr(null); };

  const switchMode = (m: Mode) => { setMode(m); handleReset(); };

  // ── Shared "sent" confirmation (magic link) ───────────────────────────────
  if (stage === 'sent') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
        <div className="w-full max-w-sm">
          <Header />
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="text-center space-y-3 py-1">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-esg-900/50 border border-esg-700">
                <CheckCircle className="w-6 h-6 text-esg-400" />
              </div>
              <div>
                <p className="text-white font-semibold">Check your inbox</p>
                <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
                  A sign-in link was sent to{' '}
                  <span className="text-white font-medium">{email}</span>.
                  Click the link to open the admin portal.
                </p>
              </div>
            </div>

            {devLink && (
              <div className="bg-amber-950/40 border border-amber-700/50 rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
                  ⚠️ {emailErr ? 'Email delivery failed' : 'Dev mode — no RESEND_API_KEY set'}
                </p>
                <p className="text-xs text-amber-300/70">
                  {emailErr
                    ? `Email could not be sent (${emailErr}). Use the link below to sign in:`
                    : 'No email was sent. Use the link below to sign in:'}
                </p>
                <a
                  href={devLink}
                  className="flex items-center gap-1.5 text-xs text-amber-300 hover:text-amber-200 underline break-all transition-colors"
                >
                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                  {devLink}
                </a>
              </div>
            )}

            <p className="text-center text-xs text-slate-500">
              Didn't receive it?{' '}
              <button onClick={handleReset} className="text-slate-400 hover:text-white underline transition-colors">
                Resend
              </button>
            </p>
          </div>
          <Footer />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        <Header />

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">

          {/* ── Mode tabs ── */}
          <div className="flex rounded-lg overflow-hidden border border-slate-700 text-xs font-medium">
            <button
              type="button"
              onClick={() => switchMode('password')}
              className={`flex-1 py-2 transition-colors ${
                mode === 'password'
                  ? 'bg-esg-700 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Password
            </button>
            <button
              type="button"
              onClick={() => switchMode('magic_link')}
              className={`flex-1 py-2 transition-colors ${
                mode === 'magic_link'
                  ? 'bg-esg-700 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Magic Link
            </button>
          </div>

          {/* ── Error banner ── */}
          {stage === 'error' && errorMsg && (
            <div className="flex items-start gap-2.5 text-sm text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* ── Password form ── */}
          {mode === 'password' && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <p className="text-xs text-slate-500 text-center leading-relaxed">
                Bootstrap only — available when no admin accounts exist yet.
                Credentials are stored in environment variables.
              </p>

              {/* Email */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
                  Admin Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoFocus
                    placeholder="admin@example.com"
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:ring-2 focus:ring-esg-500 focus:border-transparent outline-none text-sm transition-colors"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full pl-9 pr-10 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:ring-2 focus:ring-esg-500 focus:border-transparent outline-none text-sm transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={stage === 'submitting' || !email || !password}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-esg-600 hover:bg-esg-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
              >
                {stage === 'submitting' ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</>
                ) : (
                  <><ShieldCheck className="w-4 h-4" /> Sign in</>
                )}
              </button>
            </form>
          )}

          {/* ── Magic link form ── */}
          {mode === 'magic_link' && (
            <form onSubmit={handleSendLink} className="space-y-4">
              <p className="text-xs text-slate-500 text-center leading-relaxed">
                Enter your admin email — we'll send a secure one-time sign-in link.
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">
                  Admin Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoFocus
                    placeholder="admin@example.com"
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:ring-2 focus:ring-esg-500 focus:border-transparent outline-none text-sm transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={stage === 'submitting' || !email}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-esg-600 hover:bg-esg-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
              >
                {stage === 'submitting' ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Sending link…</>
                ) : (
                  <><Mail className="w-4 h-4" /> Send Admin Sign-in Link</>
                )}
              </button>
            </form>
          )}
        </div>

        <Footer />
      </div>
    </div>
  );
};

// ── Small shared sub-components ──────────────────────────────────────────────

const Header: React.FC = () => (
  <div className="text-center mb-8">
    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-esg-700 mb-4">
      <ShieldCheck className="w-7 h-7 text-white" />
    </div>
    <h1 className="text-2xl font-bold text-white">Admin Portal</h1>
    <p className="text-slate-400 text-sm mt-1">AeternumAlly — Platform Administration</p>
  </div>
);

const Footer: React.FC = () => (
  <p className="text-center text-xs text-slate-600 mt-6">
    Platform Admin access only. Tenant app is at{' '}
    <a href="/" className="text-slate-400 hover:text-white underline">/</a>
  </p>
);

export default AdminLoginScreen;
