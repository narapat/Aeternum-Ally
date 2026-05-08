import React, { useState } from 'react';
import { Loader2, ShieldCheck, AlertCircle, Mail, CheckCircle, ExternalLink } from 'lucide-react';

interface Props {
  onLoginSuccess: (token: string, email: string) => void;
}

type Stage = 'input' | 'sending' | 'sent' | 'error';

const AdminLoginScreen: React.FC<Props> = ({ onLoginSuccess }) => {
  const [email, setEmail]     = useState('');
  const [stage, setStage]     = useState<Stage>('input');
  const [errorMsg, setError]  = useState('');
  const [devLink, setDevLink] = useState<string | null>(null);   // dev mode only

  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setDevLink(null);
    setStage('sending');

    try {
      // Request the magic link through our Netlify function — NOT directly
      // through Supabase.  The server uses the admin SDK to generate the link
      // with redirectTo: /admin (bypasses Supabase's redirect-URL allowlist)
      // and sends a custom admin-branded email via Resend.
      const res = await fetch('/.netlify/functions/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request_admin_magic_link', email: email.trim() }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to send link');

      // Dev mode: server returns the link directly when RESEND_API_KEY is not set
      if (json.dev_link) setDevLink(json.dev_link);

      setStage('sent');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to send magic link');
      setStage('error');
    }
  };

  const handleResend = () => {
    setStage('input');
    setError('');
    setDevLink(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        {/* Logo / title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-esg-700 mb-4">
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Admin Portal</h1>
          <p className="text-slate-400 text-sm mt-1">Aeternum Ally — Platform Administration</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">

          {/* ── Input / sending / error ── */}
          {stage !== 'sent' && (
            <form onSubmit={handleSendLink} className="space-y-4">
              <p className="text-sm text-slate-400 text-center">
                Enter your admin email — we'll send a secure one-time sign-in link.
              </p>

              {stage === 'error' && errorMsg && (
                <div className="flex items-start gap-2.5 text-sm text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {errorMsg}
                </div>
              )}

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
                disabled={stage === 'sending' || !email}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-esg-600 hover:bg-esg-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
              >
                {stage === 'sending' ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Sending link…</>
                ) : (
                  <><Mail className="w-4 h-4" /> Send Admin Sign-in Link</>
                )}
              </button>
            </form>
          )}

          {/* ── Sent confirmation ── */}
          {stage === 'sent' && (
            <div className="space-y-4">
              <div className="text-center space-y-3 py-1">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-esg-900/50 border border-esg-700">
                  <CheckCircle className="w-6 h-6 text-esg-400" />
                </div>
                <div>
                  <p className="text-white font-semibold">Check your inbox</p>
                  <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
                    A sign-in link was sent to{' '}
                    <span className="text-white font-medium">{email}</span>.
                    Click the link in the email to open the admin portal.
                  </p>
                </div>
              </div>

              {/* Dev mode: show the link directly when Resend is not configured */}
              {devLink && (
                <div className="bg-amber-950/40 border border-amber-700/50 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
                    ⚠️ Dev mode — no RESEND_API_KEY set
                  </p>
                  <p className="text-xs text-amber-300/70">
                    No email was sent. Use the link below to sign in:
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
                <button
                  onClick={handleResend}
                  className="text-slate-400 hover:text-white underline transition-colors"
                >
                  Resend
                </button>
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          Platform Admin access only. Tenant app is at{' '}
          <a href="/" className="text-slate-400 hover:text-white underline">/</a>
        </p>
      </div>
    </div>
  );
};

export default AdminLoginScreen;
