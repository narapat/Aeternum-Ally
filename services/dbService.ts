import { supabase } from "../lib/supabaseClient";
import type {
  CompanyProfile,
  SustainabilityBusinessModel,
  SwotAnalysis,
  AssessmentData,
  ESRSTopic,
  KPI,
  BSCPerspective,
} from "../types";

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
  address: row.address ?? "",
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
  address: data.address,
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

export const fromDbCanvas = (row: any): SustainabilityBusinessModel => ({
  keyPartners: row.key_partners ?? "",
  keyActivities: row.key_activities ?? "",
  keyResources: row.key_resources ?? "",
  valueProposition: row.value_proposition ?? "",
  customerRelationships: row.customer_relationships ?? "",
  channels: row.channels ?? "",
  customerSegments: row.customer_segments ?? "",
  costStructure: row.cost_structure ?? "",
  revenueStreams: row.revenue_streams ?? "",
  ecoSocialCosts: row.eco_social_costs ?? "",
  ecoSocialBenefits: row.eco_social_benefits ?? "",
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
  strengths: row.strengths ?? "",
  weaknesses: row.weaknesses ?? "",
  opportunities: row.opportunities ?? "",
  threats: row.threats ?? "",
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
