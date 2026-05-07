import React, { useState, useEffect } from "react";
import { Mail, Lock, Loader2, AlertCircle, Info, Send } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

const AuthScreen: React.FC = () => {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Expired invite link state
  const [showResendForm, setShowResendForm] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendDone, setResendDone] = useState(false);

  // Detect Supabase OTP errors returned as URL hash fragments
  // e.g. #error=access_denied&error_code=otp_expired
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const params = new URLSearchParams(hash.slice(1));
    const errorCode = params.get("error_code");
    if (errorCode === "otp_expired" || errorCode === "otp_disabled") {
      setShowResendForm(true);
      window.history.replaceState({}, "", window.location.pathname + window.location.search);
    }
  }, []);

  const handleResendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setResendLoading(true);
    try {
      await fetch("/.netlify/functions/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_resend", email: resendEmail.trim() }),
      });
    } catch {}
    setResendLoading(false);
    setResendDone(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setIsLoading(true);
    const result = mode === "signin" ? await signIn(email, password) : await signUp(email, password);
    setIsLoading(false);

    if (result.error) {
      setError(result.error);
    } else if (mode === "signup") {
      setInfo("Check your email to confirm your account, then sign in.");
      setMode("signin");
      setPassword("");
      setConfirmPassword("");
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-gray-50 dark:bg-slate-900">
      {/* Branding panel */}
      <div
        className="lg:w-1/2 text-white p-8 lg:p-16 flex flex-col justify-between"
        style={{ backgroundColor: "#004d4d" }}
      >
        <div>
          <img
            src="/AeternumAlly-Logo-Full.png"
            alt="AeternumAlly"
            className="w-56 lg:w-72 h-auto object-contain"
          />
        </div>
        <div className="my-10 flex flex-col gap-6">
          {/* Headline */}
          <div>
            <h1 className="text-3xl lg:text-4xl font-heading font-bold leading-tight mb-3" style={{ color: "#ccff00" }}>
              Turn Sustainability Compliance<br />into Business Actions with AI
            </h1>
            <p className="text-base lg:text-lg opacity-80 font-sans leading-relaxed">
              AI-powered platform for SMEs navigating<br className="hidden lg:block" /> CSRD and ESRS reporting — from your<br className="hidden lg:block" /> business context to carbon accounting and reports.
            </p>
          </div>

          {/* Divider */}
          <div className="w-10 h-0.5 rounded-full" style={{ backgroundColor: "#ccff00", opacity: 0.6 }} />

          {/* Feature list */}
          <div className="flex flex-col gap-2 font-sans text-sm lg:text-base">
            {[
              "Sustainability Business Canvas Model",
              "Internal & External Analysis",
              "Double Materiality Assessment",
              "InsightHub & Recommendations",
              "KPI Dashboard & Goal Setting",
              "Task Management",
            ].map((f) => (
              <div key={f} className="flex items-center gap-2.5">
                <span className="flex-shrink-0 text-base font-bold" style={{ color: "#ccff00" }}>✓</span>
                <span className="opacity-90">{f}</span>
              </div>
            ))}
            {[
              "Carbon Accounting",
              "Evidence Vault",
            ].map((f) => (
              <div key={f} className="flex items-center gap-2.5 opacity-50">
                <span className="flex-shrink-0 text-base">—</span>
                <span>{f}</span>
                <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full border border-white/30 tracking-wide uppercase">
                  Q3 2026
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="text-sm font-sans font-semibold" style={{ color: "#ccff00" }}>
          CSRD/ESRS-aligned reporting with GRI compatibility
        </p>
      </div>

      {/* Form panel */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 lg:p-12 bg-gray-50 dark:bg-slate-900">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <h2 className="text-3xl font-heading font-bold text-slate-800 dark:text-white mb-2">
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 font-sans">
              {mode === "signin"
                ? "Sign in to continue your sustainability journey."
                : "Start managing your ESG reporting today."}
            </p>
          </div>

          {/* Expired invite link — self-service resend */}
          {showResendForm && (
            <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-sm text-amber-800 dark:text-amber-200">
              <div className="flex items-start gap-2 mb-3">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />
                <p className="font-semibold">Your invite link has expired.</p>
              </div>
              {resendDone ? (
                <p className="text-emerald-700 dark:text-emerald-300 font-medium">
                  ✓ If a pending invitation exists for that email, a new link has been sent. Check your inbox.
                </p>
              ) : (
                <>
                  <p className="mb-3 text-amber-700 dark:text-amber-300">
                    Enter your email below to receive a fresh invite link.
                  </p>
                  <form onSubmit={handleResendRequest} className="flex gap-2">
                    <input
                      type="email"
                      required
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="flex-1 px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    <button
                      type="submit"
                      disabled={resendLoading}
                      className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      {resendLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      Send
                    </button>
                  </form>
                </>
              )}
            </div>
          )}

          {error && (
            <div className="mb-4 flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {info && (
            <div className="mb-4 flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-300">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{info}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute top-3 left-3 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ "--tw-ring-color": "#004d4d" } as React.CSSProperties}
                  onFocus={(e) => { e.target.style.boxShadow = "0 0 0 2px #004d4d"; e.target.style.borderColor = "#004d4d"; }}
                  onBlur={(e) => { e.target.style.boxShadow = ""; e.target.style.borderColor = ""; }}
                  placeholder="you@company.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute top-3 left-3 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none"
                  onFocus={(e) => { e.target.style.boxShadow = "0 0 0 2px #004d4d"; e.target.style.borderColor = "#004d4d"; }}
                  onBlur={(e) => { e.target.style.boxShadow = ""; e.target.style.borderColor = ""; }}
                  placeholder="At least 6 characters"
                />
              </div>
            </div>

            {mode === "signup" && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Confirm password
                </label>
                <div className="relative">
                  <Lock className="absolute top-3 left-3 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-10 p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none"
                    onFocus={(e) => { e.target.style.boxShadow = "0 0 0 2px #004d4d"; e.target.style.borderColor = "#004d4d"; }}
                    onBlur={(e) => { e.target.style.boxShadow = ""; e.target.style.borderColor = ""; }}
                    placeholder="Repeat your password"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-heading font-semibold transition-all disabled:opacity-50 shadow-md"
              style={{ backgroundColor: "#ccff00", color: "#004d4d" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#aadd00"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#ccff00"; }}
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
            {mode === "signin" ? (
              <>
                Don't have an account yet?{" "}
                <button
                  onClick={() => {
                    setMode("signup");
                    setError(null);
                    setInfo(null);
                  }}
                  className="font-semibold hover:underline"
                  style={{ color: "#004d4d" }}
                >
                  Create one
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  onClick={() => {
                    setMode("signin");
                    setError(null);
                    setInfo(null);
                  }}
                  className="font-semibold hover:underline"
                  style={{ color: "#004d4d" }}
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;
