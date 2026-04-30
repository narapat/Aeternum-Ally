import React, { useEffect, useState } from "react";
import { Building2, Users, Loader2, AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

interface Props {
  userId: string;
  userEmail: string;
  onComplete: () => void;
  onSignOut: () => void;
}

const OrgSetupScreen: React.FC<Props> = ({ userId, userEmail, onComplete, onSignOut }) => {
  const [mode, setMode] = useState<"choice" | "create" | "join">("choice");
  const [companyName, setCompanyName] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-detect invite token in URL (?invite_token=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("invite_token");
    if (token) {
      setInviteToken(token);
      setMode("join");
    }
  }, []);

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      setError("Please enter your company name.");
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      // 1. Create organization
      const { data: org, error: orgErr } = await supabase
        .from("organizations")
        .insert({})
        .select()
        .single();
      if (orgErr) throw orgErr;

      // 2. Add owner membership
      const { error: memErr } = await supabase.from("organization_members").insert({
        organization_id: org.id,
        user_id: userId,
        role: "Owner",
        email: userEmail,
      });
      if (memErr) throw memErr;

      // 3. Seed an empty company profile with the company name
      await supabase.from("company_profiles").insert({
        organization_id: org.id,
        name: companyName.trim(),
      });

      onComplete();
    } catch (e: any) {
      setError(e?.message ?? "Failed to create organization. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteToken.trim()) {
      setError("Please enter your invite token.");
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const sessionResp = await supabase.auth.getSession();
      const accessToken = sessionResp.data.session?.access_token;
      if (!accessToken) throw new Error("Not signed in.");

      const response = await fetch("/.netlify/functions/accept-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ invite_token: inviteToken.trim() }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not accept invite. The token may be invalid or expired.");
      }

      // Strip the token from the URL so refresh doesn't re-trigger
      const url = new URL(window.location.href);
      url.searchParams.delete("invite_token");
      window.history.replaceState({}, "", url.toString());

      onComplete();
    } catch (e: any) {
      setError(e?.message ?? "Failed to accept invitation.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-esg-100 dark:bg-esg-900/30 text-esg-700 dark:text-esg-300 text-xs font-bold uppercase tracking-wider mb-4">
            <CheckCircle2 className="w-3 h-3" /> Signed in as {userEmail}
          </div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white mb-2">
            One more step to get started
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            {mode === "choice" && "Set up your company workspace or join an existing team."}
            {mode === "create" && "Tell us about your company."}
            {mode === "join" && "Paste the invite token your team admin shared with you."}
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-8">
          {mode === "choice" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => {
                  setMode("create");
                  setError(null);
                }}
                className="p-6 text-left rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-esg-500 hover:bg-esg-50 dark:hover:bg-esg-900/20 transition-all group"
              >
                <Building2 className="w-8 h-8 text-esg-600 mb-4" />
                <h3 className="font-bold text-slate-800 dark:text-white mb-1">Create a new company</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Set up a fresh workspace for your business and invite your team later.
                </p>
              </button>
              <button
                onClick={() => {
                  setMode("join");
                  setError(null);
                }}
                className="p-6 text-left rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all group"
              >
                <Users className="w-8 h-8 text-indigo-600 mb-4" />
                <h3 className="font-bold text-slate-800 dark:text-white mb-1">Join with invite token</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Got an invite from a team admin? Paste the token here to join their workspace.
                </p>
              </button>
            </div>
          )}

          {mode === "create" && (
            <form onSubmit={handleCreateOrg} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Company Name
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. EcoTech Solutions Ltd."
                  className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-esg-500 focus:border-esg-500"
                  autoFocus
                />
                <p className="text-xs text-slate-500 mt-2">
                  You can fill out the rest of your company profile later.
                </p>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setMode("choice")}
                  className="px-4 py-2 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg flex items-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-6 py-2 bg-esg-600 text-white font-medium rounded-lg hover:bg-esg-700 shadow-lg shadow-esg-600/20 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create workspace
                </button>
              </div>
            </form>
          )}

          {mode === "join" && (
            <form onSubmit={handleJoinOrg} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Invite Token
                </label>
                <input
                  type="text"
                  value={inviteToken}
                  onChange={(e) => setInviteToken(e.target.value)}
                  placeholder="paste the token from your invite email"
                  className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm"
                  autoFocus
                />
                <p className="text-xs text-slate-500 mt-2">
                  The token is the long ID inside your invitation email link.
                </p>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setMode("choice")}
                  className="px-4 py-2 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg flex items-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Join workspace
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="text-center mt-6">
          <button
            onClick={onSignOut}
            className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:underline"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrgSetupScreen;
