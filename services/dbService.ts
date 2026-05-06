import { supabase } from "../lib/supabaseClient";
import type {
  CompanyProfile,
  SustainabilityBusinessModel,
  SwotAnalysis,
  AssessmentData,
  ESRSTopic,
  KPI,
  BSCPerspective,
  Organization,
  OrgMember,
  OrgRole,
} from "../types";

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
  created_at: string;
}

export async function fetchAiSettings(
  orgId: string
): Promise<{ model: string } | null> {
  const { data, error } = await supabase
    .from("organization_ai_settings")
    .select("model")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return data as { model: string } | null;
}

export async function upsertAiSettings(orgId: string, model: string): Promise<void> {
  const { error } = await supabase
    .from("organization_ai_settings")
    .upsert({ organization_id: orgId, model }, { onConflict: "organization_id" });
  if (error) throw error;
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

export async function deleteAssessment(id: string): Promise<void> {
  const { error } = await supabase.from("assessments").delete().eq("id", id);
  if (error) throw error;
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

export async function deleteKpi(id: string): Promise<void> {
  const { error } = await supabase.from("kpis").delete().eq("id", id);
  if (error) throw error;
}
