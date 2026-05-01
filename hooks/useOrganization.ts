import { useCallback, useEffect, useState } from "react";
import { fetchMembership, fetchOrganization, fetchOrgMembers } from "../services/dbService";
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
      const membership = await fetchMembership(userId);

      if (!membership) {
        // user has no org yet — OrgSetupScreen will handle this
        setOrganization(null);
        setMembers([]);
        setCurrentUserRole(null);
        setIsLoading(false);
        return;
      }

      const [org, allMembers] = await Promise.all([
        fetchOrganization(membership.organization_id),
        fetchOrgMembers(membership.organization_id),
      ]);

      setOrganization(org);
      setCurrentUserRole(membership.role);
      setMembers(allMembers);
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
