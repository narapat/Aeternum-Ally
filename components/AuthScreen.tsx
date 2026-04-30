import React, { useState } from "react";
import { Layout, Mail, Lock, Loader2, AlertCircle } from "lucide-react";
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
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50 dark:bg-slate-900">
      {/* Branding panel */}
      <div className="lg:w-1/2 bg-gradient-to-br from-esg-700 via-esg-600 to-emerald-800 text-white p-8 lg:p-16 flex flex-col justify-between">
        <div className="flex items-center gap-3">
          <Layout className="w-8 h-8" />
          <span className="text-2xl font-bold">Aeternum Ally</span>
        </div>
        <div className="my-12">
          <h1 className="text-3xl lg:text-5xl font-serif font-bold mb-6 leading-tight">
            Sustainability reporting,<br />powered by your expertise.
          </h1>
          <p className="text-lg opacity-90 max-w-lg">
            AI-assisted ESRS &amp; CSRD compliance for SMEs. Built for consultants and ESG teams to deliver structured sustainability statements — faster, and grounded in the business model.
          </p>
        </div>
        <div className="text-sm opacity-70">
          ESRS · GRI · Double Materiality · Balanced Scorecard
        </div>
      </div>

      {/* Form panel */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-slate-800 dark:text-white mb-2">
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </h2>
            <p className="text-slate-500 dark:text-slate-400">
              {mode === "signin"
                ? "Sign in to continue your sustainability journey."
                : "Start managing your ESG reporting today."}
            </p>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {info && (
            <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-sm text-emerald-700 dark:text-emerald-300">
              {info}
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
                  className="w-full pl-10 p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-esg-500 focus:border-esg-500"
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
                  className="w-full pl-10 p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-esg-500 focus:border-esg-500"
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
                    className="w-full pl-10 p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-esg-500 focus:border-esg-500"
                    placeholder="Repeat your password"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-esg-600 text-white py-3 rounded-lg font-medium hover:bg-esg-700 shadow-lg shadow-esg-600/20 transition-all disabled:opacity-50"
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
                  className="text-esg-600 dark:text-esg-400 font-medium hover:underline"
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
                  className="text-esg-600 dark:text-esg-400 font-medium hover:underline"
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
