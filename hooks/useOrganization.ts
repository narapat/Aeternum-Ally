import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Organization, OrgMember, OrgRole } from "../types";

interface UseOrganizationResult {
  organization: Organization | null;
  members: OrgMember[];
  currentUserRole: OrgRole | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useOrganization(userId: string | undefined): UseOrganizationResult {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<OrgRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrg = useCallback(async () => {
    if (!userId) {
      setOrganization(null);
      setMembers([]);
      setCurrentUserRole(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Get the user's first membership (MVP: one user = one org)
      const { data: membership, error: memErr } = await supabase
        .from("organization_members")
        .select("organization_id, role")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();

      if (memErr) throw memErr;

      if (!membership) {
        // user has no org yet — OrgSetupScreen will handle this
        setOrganization(null);
        setMembers([]);
        setCurrentUserRole(null);
        setIsLoading(false);
        return;
      }

      // 2. Org details
      const { data: org, error: orgErr } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", membership.organization_id)
        .single();
      if (orgErr) throw orgErr;

      // 3. All members of that org
      const { data: allMembers, error: membersErr } = await supabase
        .from("organization_members")
        .select("*")
        .eq("organization_id", membership.organization_id)
        .order("joined_at", { ascending: true });
      if (membersErr) throw membersErr;

      setOrganization(org as Organization);
      setCurrentUserRole(membership.role as OrgRole);
      setMembers((allMembers ?? []) as OrgMember[]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load organization");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchOrg();
  }, [fetchOrg]);

  return { organization, members, currentUserRole, isLoading, error, refetch: fetchOrg };
}
