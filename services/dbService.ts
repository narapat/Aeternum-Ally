import { supabase } from "../lib/supabaseClient";
import type {
  CompanyProfile,
  SustainabilityBusinessModel,
  SwotAnalysis,
  AssessmentData,
  AssessmentScoring,
  ESRSTopic,
  KPI,
  BSCPerspective,
  Organization,
  OrgMember,
  OrgRole,
  QualityCheck,
  StrategicInsight,
  RecommendedAction,
  InsightHubResponse,
  Task,
  SuggestedTask,
  TaskStatus,
} from "../types";
import { deleteEvidenceByEntity } from './evidenceService';

// =================================================================
// GENERIC SINGLETON  (one row per org — used by useOrgData hook)
// =================================================================

export async function fetchSingleton<T>(
  table: string,
  orgId: string,
  fromDb: (row: any) => T
): Promise<T | null> {
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return data ? fromDb(data) : null;
}

export async function upsertSingleton(
  table: string,
  orgId: string,
  payload: Record<string, any>
): Promise<void> {
  const { error } = await supabase
    .from(table)
    .upsert({ ...payload, organization_id: orgId }, { onConflict: "organization_id" });
  if (error) throw error;
}

// =================================================================
// ORGANIZATION & MEMBERSHIP
// =================================================================

export async function fetchMembership(
  userId: string
): Promise<{ organization_id: string; role: OrgRole } | null> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as { organization_id: string; role: OrgRole } | null;
}

export async function fetchOrganization(orgId: string): Promise<Organization> {
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", orgId)
    .single();
  if (error) throw error;
  return data as Organization;
}

export async function fetchOrgMembers(orgId: string): Promise<OrgMember[]> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("*")
    .eq("organization_id", orgId)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as OrgMember[];
}

export async function removeMember(memberId: string): Promise<void> {
  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("id", memberId);
  if (error) throw error;
}

export async function updateMemberRole(memberId: string, role: OrgRole): Promise<void> {
  const { error } = await supabase
    .from("organization_members")
    .update({ role })
    .eq("id", memberId);
  if (error) throw error;
}

export async function createOrganizationWithOwner(companyName: string): Promise<void> {
  const { error } = await supabase.rpc("create_organization_with_owner", {
    p_company_name: companyName,
  });
  if (error) throw error;
}

export async function lookupPendingInvite(
  email: string
): Promise<{ id: string; organization_id: string } | null> {
  const { data, error } = await supabase
    .from("organization_invites")
    .select("id, organization_id")
    .eq("email", email.toLowerCase())
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as { id: string; organization_id: string } | null;
}

export async function cancelInvite(inviteId: string): Promise<void> {
  const { error } = await supabase
    .from("organization_invites")
    .delete()
    .eq("id", inviteId);
  if (error) throw error;
}

// =================================================================
// AI SETTINGS & USAGE LOG
// =================================================================

export interface AiUsageRow {
  id: string;
  user_email: string | null;
  action: string;
  provider: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  duration_ms: number | null;
  success: boolean;
  estimated_cost_usd: number | null;
  quota_type: string | null;
  created_at: string;
}

export interface AiSettings {
  model: string;
  use_byok: boolean;
  byok_provider: string | null;
  /** API key is NEVER returned from the server for security. Only a boolean `has_byok_key` is exposed. */
  has_byok_key: boolean;
  soft_quota_monthly: number | null;
}

const BYOK_SETTINGS_ENDPOINT = "/.netlify/functions/byok-settings";

async function requestByokSettings(
  orgId: string,
  method: "GET" | "PUT",
  settings?: {
    use_byok: boolean;
    byok_provider: string | null;
    byok_api_key?: string | null;
  }
): Promise<AiSettings> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (sessionError || !accessToken) {
    throw new Error("You must be signed in to manage BYOK settings.");
  }

  const url = method === "GET"
    ? `${BYOK_SETTINGS_ENDPOINT}?organization_id=${encodeURIComponent(orgId)}`
    : BYOK_SETTINGS_ENDPOINT;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(method === "PUT" ? { "Content-Type": "application/json" } : {}),
    },
    body: method === "PUT"
      ? JSON.stringify({ organization_id: orgId, ...settings })
      : undefined,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error ?? "BYOK settings are temporarily unavailable.");
  }
  return payload as AiSettings;
}

export async function fetchAiSettings(
  orgId: string
): Promise<AiSettings | null> {
  return requestByokSettings(orgId, "GET");
}

/** Upserts the AI model choice (always safe to call). */
export async function upsertAiSettings(orgId: string, model: string): Promise<void> {
  const { error } = await supabase
    .from("organization_ai_settings")
    .upsert({ organization_id: orgId, model }, { onConflict: "organization_id" });
  if (error) throw error;
}

/** Upserts BYOK fields. Pass `byok_api_key: null` to clear the stored key. */
export async function upsertByokSettings(
  orgId: string,
  settings: {
    use_byok: boolean;
    byok_provider: string | null;
    byok_api_key?: string | null; // omit to leave unchanged
  }
): Promise<void> {
  await requestByokSettings(orgId, "PUT", settings);
}

/** Returns the number of successful AI calls made by this org this calendar month. */
export async function fetchMonthlyCallCount(orgId: string): Promise<number> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from("ai_usage_log")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("success", true)
    .gte("created_at", monthStart.toISOString());
  if (error) throw error;
  return count ?? 0;
}

export async function fetchAiUsageLog(
  orgId: string,
  limit = 500
): Promise<AiUsageRow[]> {
  const { data, error } = await supabase
    .from("ai_usage_log")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AiUsageRow[];
}

// =================================================================
// USER PROFILE  (1 row per user, owned by that user)
// =================================================================

export interface UserProfile {
  user_id: string;
  display_name: string | null;
  phone: string | null;
  mobile: string | null;
  notes: string | null;
  updated_at: string | null;
}

export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("user_id, display_name, phone, mobile, notes, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as UserProfile | null;
}

export async function upsertUserProfile(
  userId: string,
  updates: Pick<UserProfile, 'display_name' | 'phone' | 'mobile' | 'notes'>
): Promise<void> {
  const { error } = await supabase
    .from("user_profiles")
    .upsert({ user_id: userId, ...updates }, { onConflict: "user_id" });
  if (error) throw error;
}

// =================================================================
// COMPANY PROFILE  (1 row per org)
// =================================================================

export const fromDbProfile = (row: any): CompanyProfile => ({
  name: row.name ?? "",
  taxId: row.tax_id ?? "",
  industry: row.industry ?? "",
  isicCode: row.isic_code ?? "",
  foundingYear: row.founding_year ?? "",
  website: row.website ?? "",
  addressStreet: row.address_street ?? "",
  addressCity: row.address_city ?? "",
  addressState: row.address_state ?? "",
  addressPostalCode: row.address_postal_code ?? "",
  addressCountry: row.address_country ?? "",
  contactEmail: row.contact_email ?? "",
  contactPhone: row.contact_phone ?? "",
  employeeCount: row.employee_count ?? "",
  revenueRange: row.revenue_range ?? "",
  description: row.description ?? "",
  mission: row.mission ?? "",
  vision: row.vision ?? "",
  productsServices: row.products_services ?? "",
});

export const toDbProfile = (data: CompanyProfile) => ({
  name: data.name,
  tax_id: data.taxId,
  industry: data.industry,
  isic_code: data.isicCode,
  founding_year: data.foundingYear,
  website: data.website,
  address_street: data.addressStreet,
  address_city: data.addressCity,
  address_state: data.addressState,
  address_postal_code: data.addressPostalCode,
  address_country: data.addressCountry,
  contact_email: data.contactEmail,
  contact_phone: data.contactPhone,
  employee_count: data.employeeCount,
  revenue_range: data.revenueRange,
  description: data.description,
  mission: data.mission,
  vision: data.vision,
  products_services: data.productsServices,
});

// =================================================================
// BUSINESS MODEL CANVAS  (1 row per org)
// =================================================================

// Normalise a DB jsonb field → string[]. Handles both the new jsonb array
// format and the legacy text format (in case of partial migrations).
function toStringArray(val: any): string[] {
  if (Array.isArray(val)) return val.filter((v) => typeof v === "string");
  if (typeof val === "string" && val.trim()) {
    return val.split("\n").map((s) => s.replace(/^[\s•\-\*–]+/, "").trim()).filter(Boolean);
  }
  return [];
}

export const fromDbCanvas = (row: any): SustainabilityBusinessModel => ({
  keyPartners: toStringArray(row.key_partners),
  keyActivities: toStringArray(row.key_activities),
  keyResources: toStringArray(row.key_resources),
  valueProposition: toStringArray(row.value_proposition),
  customerRelationships: toStringArray(row.customer_relationships),
  channels: toStringArray(row.channels),
  customerSegments: toStringArray(row.customer_segments),
  costStructure: toStringArray(row.cost_structure),
  revenueStreams: toStringArray(row.revenue_streams),
  ecoSocialCosts: toStringArray(row.eco_social_costs),
  ecoSocialBenefits: toStringArray(row.eco_social_benefits),
});

export const toDbCanvas = (data: SustainabilityBusinessModel) => ({
  key_partners: data.keyPartners,
  key_activities: data.keyActivities,
  key_resources: data.keyResources,
  value_proposition: data.valueProposition,
  customer_relationships: data.customerRelationships,
  channels: data.channels,
  customer_segments: data.customerSegments,
  cost_structure: data.costStructure,
  revenue_streams: data.revenueStreams,
  eco_social_costs: data.ecoSocialCosts,
  eco_social_benefits: data.ecoSocialBenefits,
});

// =================================================================
// SWOT ANALYSIS  (1 row per org)
// =================================================================

export const fromDbSwot = (row: any): SwotAnalysis => ({
  strengths: toStringArray(row.strengths),
  weaknesses: toStringArray(row.weaknesses),
  opportunities: toStringArray(row.opportunities),
  threats: toStringArray(row.threats),
});

export const toDbSwot = (data: SwotAnalysis) => ({
  strengths: data.strengths,
  weaknesses: data.weaknesses,
  opportunities: data.opportunities,
  threats: data.threats,
});

// =================================================================
// ASSESSMENTS  (many per org)
// =================================================================

export const fromDbAssessment = (row: any): AssessmentData => ({
  id: row.id,
  topic: row.topic as ESRSTopic,
  impactDescription: row.impact_description ?? "",
  financialDescription: row.financial_description ?? "",
  impactScore: row.impact_score ?? { scale: 1, scope: 1, irremediability: 1, likelihood: 1 },
  financialScore: row.financial_score ?? { magnitude: 1, likelihood: 1 },
  impactMaterialityValue: Number(row.impact_materiality_value ?? 0),
  financialMaterialityValue: Number(row.financial_materiality_value ?? 0),
  isMaterial: !!row.is_material,
  aiScoringSuggestion: (row.ai_scoring_suggestion as (AssessmentScoring & { suggestedAt: string }) | null) ?? null,
  updatedAt: row.updated_at ?? undefined,
});

const toDbAssessment = (data: AssessmentData, orgId: string) => ({
  id: data.id,
  organization_id: orgId,
  topic: data.topic,
  impact_description: data.impactDescription,
  financial_description: data.financialDescription,
  impact_score: data.impactScore,
  financial_score: data.financialScore,
  impact_materiality_value: data.impactMaterialityValue,
  financial_materiality_value: data.financialMaterialityValue,
  is_material: data.isMaterial,
  ai_scoring_suggestion: data.aiScoringSuggestion ?? null,
});

export async function fetchAssessments(orgId: string): Promise<AssessmentData[]> {
  const { data, error } = await supabase
    .from("assessments")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(fromDbAssessment);
}

export async function upsertAssessment(orgId: string, assessment: AssessmentData): Promise<AssessmentData> {
  const payload = toDbAssessment(assessment, orgId);
  // Supabase requires uuid format for `id`. If the incoming id is a legacy short string,
  // strip it so the DB generates a fresh uuid on insert.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.id ?? "");
  if (!isUuid) delete (payload as any).id;
  const { data, error } = await supabase
    .from("assessments")
    .upsert(payload, { onConflict: "id" })
    .select()
    .single();
  if (error) throw error;
  return fromDbAssessment(data);
}

export async function deleteAssessment(id: string, orgId?: string): Promise<void> {
  if (orgId) {
    try {
      await deleteEvidenceByEntity(orgId, 'assessment', id);
    } catch (e) {
      console.warn('Failed to delete evidence for assessment:', e);
    }
  }
  const { error } = await supabase.from("assessments").delete().eq("id", id);
  if (error) throw error;
}

// =================================================================
// DMA INSIGHTS  (quality checks, strategic insight, suggested tasks)
// =================================================================

// Save quality check result for one topic onto its assessment row.
export async function saveQualityCheck(
  assessmentId: string,
  orgId: string,
  check: QualityCheck,
): Promise<void> {
  const { error } = await supabase
    .from("assessments")
    .update({
      quality_check_status: check.status,
      quality_check_issues: check.issues,
    })
    .eq("id", assessmentId)
    .eq("organization_id", orgId);
  if (error) console.warn("saveQualityCheck failed:", error.message);
}

// Upsert the org's strategic insight and recommended actions.
export async function saveDMAInsight(
  orgId: string,
  strategicInsight: StrategicInsight,
  recommendedActions: RecommendedAction[],
): Promise<void> {
  const { error } = await supabase
    .from("dma_insights")
    .upsert(
      { organization_id: orgId, strategic_insight: strategicInsight, recommended_actions: recommendedActions },
      { onConflict: "organization_id" },
    );
  if (error) console.warn("saveDMAInsight failed:", error.message);
}

// Load the cached DMA insight from DB. Returns null if the org has never run analysis.
export async function loadDMAInsight(orgId: string): Promise<InsightHubResponse | null> {
  const [insightResp, checksResp] = await Promise.all([
    supabase
      .from("dma_insights")
      .select("strategic_insight, recommended_actions")
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabase
      .from("assessments")
      .select("topic, quality_check_status, quality_check_issues")
      .eq("organization_id", orgId)
      .not("quality_check_status", "is", null),
  ]);

  if (!insightResp.data) return null;

  const qualityChecks: QualityCheck[] = (checksResp.data ?? []).map((row) => ({
    topic: String(row.topic).split(" ")[0],
    topicTitle: String(row.topic).replace(/^[A-Z0-9]+ /, ""),
    status: row.quality_check_status as QualityCheck["status"],
    issues: (row.quality_check_issues as QualityCheck["issues"]) ?? [],
  }));

  return {
    qualityChecks,
    strategicInsight: insightResp.data.strategic_insight as StrategicInsight,
    recommendedActions: insightResp.data.recommended_actions as RecommendedAction[],
  };
}

// Delete the org's strategic insight row so the next hub visit triggers a fresh analysis.
export async function clearDMAInsight(orgId: string): Promise<void> {
  await supabase.from("dma_insights").delete().eq("organization_id", orgId);
}

// Replace undismissed DMA suggested tasks with a fresh batch from the AI.
export async function saveDMASuggestedTasks(
  orgId: string,
  actions: RecommendedAction[],
  assessments: AssessmentData[],
): Promise<void> {
  // Remove stale undismissed DMA suggestions before inserting new ones.
  await supabase
    .from("suggested_tasks")
    .delete()
    .eq("organization_id", orgId)
    .eq("source_type", "dma")
    .eq("dismissed", false);

  if (actions.length === 0) return;

  // Resolve each action's topic code to an assessment UUID for traceability.
  const topicToId = new Map(assessments.map((a) => [String(a.topic).split(" ")[0], a.id]));

  const { error } = await supabase.from("suggested_tasks").insert(
    actions.map((a) => ({
      organization_id: orgId,
      title: a.title,
      description: a.description,
      type: a.type,
      priority: a.priority,
      source_type: "dma",
      source_id: topicToId.get(a.source_id) ?? null,
      esrs_ref: a.esrs_ref,
      estimated_time: a.estimated_time,
    })),
  );
  if (error) console.warn("saveDMASuggestedTasks failed:", error.message);
}

// =================================================================
// KPIS  (many per org)
// =================================================================

export const fromDbKpi = (row: any): KPI => ({
  id: row.id,
  name: row.name ?? "",
  description: row.description ?? "",
  perspective: row.perspective as BSCPerspective,
  frequency: row.frequency as "Monthly" | "Quarterly" | "Annually",
  unit: row.unit ?? "",
  targetValue: Number(row.target_value ?? 0),
  currentValue: Number(row.current_value ?? 0),
  linkedKpiIds: row.linked_kpi_ids ?? [],
  raci: row.raci ?? { responsible: "", accountable: "", consulted: "", informed: "" },
  history: row.history ?? [],
});

const toDbKpi = (data: KPI, orgId: string) => ({
  id: data.id,
  organization_id: orgId,
  name: data.name,
  description: data.description,
  perspective: data.perspective,
  frequency: data.frequency,
  unit: data.unit,
  target_value: data.targetValue,
  current_value: data.currentValue,
  linked_kpi_ids: data.linkedKpiIds,
  raci: data.raci,
  history: data.history,
});

export async function fetchKpis(orgId: string): Promise<KPI[]> {
  const { data, error } = await supabase
    .from("kpis")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(fromDbKpi);
}

export async function upsertKpi(orgId: string, kpi: KPI): Promise<KPI> {
  const payload = toDbKpi(kpi, orgId);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.id ?? "");
  if (!isUuid) delete (payload as any).id;
  const { data, error } = await supabase
    .from("kpis")
    .upsert(payload, { onConflict: "id" })
    .select()
    .single();
  if (error) throw error;
  return fromDbKpi(data);
}

export async function deleteKpi(id: string, orgId?: string): Promise<void> {
  if (orgId) {
    try {
      await deleteEvidenceByEntity(orgId, 'kpi', id);
    } catch (e) {
      console.warn('Failed to delete evidence for KPI:', e);
    }
  }
  const { error } = await supabase.from("kpis").delete().eq("id", id);
  if (error) throw error;
}

// =================================================================
// TASKS  (many per org)
// =================================================================

const fromDbTask = (row: any): Task => ({
  id: row.id,
  organization_id: row.organization_id,
  title: row.title ?? "",
  description: row.description ?? null,
  notes: row.notes ?? null,
  type: row.type,
  status: row.status,
  priority: row.priority,
  due_date: row.due_date ?? null,
  assignee_id: row.assignee_id ?? null,
  assigned_by: row.assigned_by ?? null,
  assigned_at: row.assigned_at ?? null,
  source_type: row.source_type ?? null,
  source_id: row.source_id ?? null,
  esrs_ref: row.esrs_ref ?? null,
  created_by: row.created_by ?? null,
  created_at: row.created_at,
  updated_at: row.updated_at,
  completed_at: row.completed_at ?? null,
});

export async function fetchTasks(orgId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(fromDbTask);
}

export async function upsertTask(orgId: string, task: Partial<Task> & Pick<Task, 'title' | 'type' | 'status' | 'priority'>): Promise<Task> {
  const payload: any = {
    organization_id: orgId,
    title: task.title,
    description: task.description ?? null,
    notes: task.notes ?? null,
    type: task.type,
    status: task.status,
    priority: task.priority,
    due_date: task.due_date ?? null,
    assignee_id: task.assignee_id ?? null,
    assigned_by: task.assigned_by ?? null,
    assigned_at: task.assigned_at ?? null,
    source_type: task.source_type ?? null,
    source_id: task.source_id ?? null,
    esrs_ref: task.esrs_ref ?? null,
  };
  if (task.status === 'done' && !task.completed_at) payload.completed_at = new Date().toISOString();
  if (task.status !== 'done') payload.completed_at = null;

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(task.id ?? "");
  if (isUuid) payload.id = task.id;

  const { data, error } = await supabase
    .from("tasks")
    .upsert(payload, { onConflict: "id" })
    .select()
    .single();
  if (error) throw error;
  return fromDbTask(data);
}

export async function deleteTask(id: string, orgId?: string): Promise<void> {
  if (orgId) {
    try {
      await deleteEvidenceByEntity(orgId, 'task', id);
    } catch (e) {
      console.warn('Failed to delete evidence for task:', e);
    }
  }
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}

// =================================================================
// SUGGESTED TASKS  (many per org)
// =================================================================

const fromDbSuggestedTask = (row: any): SuggestedTask => ({
  id: row.id,
  organization_id: row.organization_id,
  title: row.title ?? "",
  description: row.description ?? null,
  type: row.type,
  priority: row.priority,
  source_type: row.source_type ?? "",
  source_id: row.source_id ?? null,
  esrs_ref: row.esrs_ref ?? null,
  estimated_time: row.estimated_time ?? null,
  dismissed: row.dismissed ?? false,
  dismissed_at: row.dismissed_at ?? null,
  dismissed_by: row.dismissed_by ?? null,
  converted_to_task_id: row.converted_to_task_id ?? null,
  converted_at: row.converted_at ?? null,
  created_at: row.created_at,
});

export async function fetchSuggestedTasks(orgId: string, includeConverted = false): Promise<SuggestedTask[]> {
  let query = supabase
    .from("suggested_tasks")
    .select("*")
    .eq("organization_id", orgId)
    .eq("dismissed", false)
    .order("created_at", { ascending: false });
  if (!includeConverted) query = query.is("converted_to_task_id", null);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(fromDbSuggestedTask);
}

export async function dismissSuggestedTask(id: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("suggested_tasks")
    .update({ dismissed: true, dismissed_at: new Date().toISOString(), dismissed_by: userId })
    .eq("id", id);
  if (error) throw error;
}

export async function restoreSuggestedTask(id: string): Promise<void> {
  const { error } = await supabase
    .from("suggested_tasks")
    .update({ dismissed: false, dismissed_at: null, dismissed_by: null })
    .eq("id", id);
  if (error) throw error;
}

export async function fetchDismissedSuggestedTasks(orgId: string): Promise<SuggestedTask[]> {
  const { data, error } = await supabase
    .from("suggested_tasks")
    .select("*")
    .eq("organization_id", orgId)
    .eq("dismissed", true)
    .is("converted_to_task_id", null)
    .order("dismissed_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(fromDbSuggestedTask);
}

export async function promoteSuggestedTask(
  orgId: string,
  suggested: SuggestedTask,
  overrides: { assignee_id?: string | null; due_date?: string | null; status?: TaskStatus } = {},
): Promise<Task> {
  const task = await upsertTask(orgId, {
    title: suggested.title,
    description: suggested.description,
    type: suggested.type,
    status: overrides.status ?? 'todo',
    priority: suggested.priority,
    due_date: overrides.due_date ?? null,
    assignee_id: overrides.assignee_id ?? null,
    source_type: suggested.source_type as Task['source_type'],
    source_id: suggested.source_id,
    esrs_ref: suggested.esrs_ref,
  });

  const { error } = await supabase
    .from("suggested_tasks")
    .update({ converted_to_task_id: task.id, converted_at: new Date().toISOString() })
    .eq("id", suggested.id);
  if (error) console.warn("promoteSuggestedTask: failed to mark conversion:", error.message);

  return task;
}

export async function saveSuggestedTasks(
  orgId: string,
  tasks: Array<Omit<SuggestedTask, 'id' | 'organization_id' | 'dismissed' | 'dismissed_at' | 'dismissed_by' | 'converted_to_task_id' | 'converted_at' | 'created_at'>>,
): Promise<void> {
  if (tasks.length === 0) return;
  const { error } = await supabase.from("suggested_tasks").insert(
    tasks.map((t) => ({
      organization_id: orgId,
      title: t.title,
      description: t.description ?? null,
      type: t.type,
      priority: t.priority,
      source_type: t.source_type,
      source_id: t.source_id ?? null,
      esrs_ref: t.esrs_ref ?? null,
      estimated_time: t.estimated_time ?? null,
    })),
  );
  if (error) throw error;
}
