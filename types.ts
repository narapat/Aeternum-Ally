
export enum ESRSTopic {
  E1 = 'E1 Climate Change',
  E2 = 'E2 Pollution',
  E3 = 'E3 Water & Marine Resources',
  E4 = 'E4 Biodiversity & Ecosystems',
  E5 = 'E5 Resource Use & Circular Economy',
  S1 = 'S1 Own Workforce',
  S2 = 'S2 Workers in the Value Chain',
  S3 = 'S3 Affected Communities',
  S4 = 'S4 Consumers & End-users',
  G1 = 'G1 Business Conduct',
}

export interface ImpactScore {
  scale: number; // 1-5
  scope: number; // 1-5
  irremediability: number; // 1-5
  likelihood: number; // 1-5
}

export interface FinancialScore {
  magnitude: number; // 1-5
  likelihood: number; // 1-5
}

export interface AssessmentScoringSuggestion {
  score: number;
  reasoning: string;
}

export interface AssessmentScoring {
  impact: {
    scale: AssessmentScoringSuggestion;
    scope: AssessmentScoringSuggestion;
    irremediability: AssessmentScoringSuggestion;
    likelihood: AssessmentScoringSuggestion;
  };
  financial: {
    magnitude: AssessmentScoringSuggestion;
    likelihood: AssessmentScoringSuggestion;
  };
}

export interface AssessmentData {
  id: string;
  topic: ESRSTopic;
  impactDescription: string;
  financialDescription: string;
  impactScore: ImpactScore;
  financialScore: FinancialScore;
  impactMaterialityValue: number; // Calculated
  financialMaterialityValue: number; // Calculated
  isMaterial: boolean;
  aiScoringSuggestion?: (AssessmentScoring & { suggestedAt: string }) | null;
  updatedAt?: string;
}

export interface User {
  name: string;
  role: 'Owner' | 'Admin' | 'Manager' | 'Consultant';
  companyName: string;
  companyDescription: string;
}

// --- Multi-tenant types ---

export type OrgRole = 'Owner' | 'Admin' | 'Manager' | 'Consultant';

export interface Organization {
  id: string;
  created_at: string;
  updated_at?: string;
}

export interface OrgMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrgRole;
  email: string | null;
  invited_by: string | null;
  joined_at: string;
}

export interface OrgInvite {
  id: string;            // also serves as the invite token
  organization_id: string;
  email: string;
  role: Exclude<OrgRole, 'Owner'>;
  invited_by: string;
  expires_at: string;
  created_at: string;
}

export interface CompanyProfile {
  name: string;
  taxId: string; // Registration Number
  industry: string;
  isicCode: string; // Standard Industry Classification
  foundingYear: string;
  website: string;
  // Structured address (replaces free-text address field)
  addressStreet: string;
  addressCity: string;
  addressState: string;
  addressPostalCode: string;
  addressCountry: string;
  // Contact
  contactEmail: string;
  contactPhone: string;
  employeeCount: string; // Micro, Small, Medium
  revenueRange: string;
  description: string; // General Description
  mission: string;
  vision: string;
  productsServices: string; // Comma separated list
}

export interface SustainabilityBusinessModel {
  keyPartners: string[];
  keyActivities: string[];
  keyResources: string[];
  valueProposition: string[];
  customerRelationships: string[];
  channels: string[];
  customerSegments: string[];
  costStructure: string[];
  revenueStreams: string[];
  ecoSocialCosts: string[];
  ecoSocialBenefits: string[];
}

export interface SwotAnalysis {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
}

// --- Performance Management Types ---

export enum BSCPerspective {
  FINANCIAL = 'Financial',
  CUSTOMER = 'Customer',
  INTERNAL = 'Internal Processes',
  LEARNING = 'Learning & Growth',
}

export interface RACI {
  responsible: string; // Who does the work
  accountable: string; // Who signs off (Ultimate owner)
  consulted: string;   // Who has information needed
  informed: string;    // Who needs to be notified
}

export interface KPI {
  id: string;
  name: string;
  description: string;
  perspective: BSCPerspective;
  frequency: 'Monthly' | 'Quarterly' | 'Annually';
  unit: string; // e.g., %, THB, #
  targetValue: number;
  currentValue: number;
  linkedKpiIds: string[]; // IDs of KPIs that this KPI influences (Success in this drives success in others)
  raci: RACI;
  history: { date: string; value: number }[]; // For trend analysis
}

// =============================================================
// Phase 2 Types
// =============================================================

// --- Tasks ---

export type TaskType = 'fix' | 'comply' | 'improve';
export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskSourceType = 'dma' | 'insight_hub' | 'kpi' | 'manual';

export interface Task {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  notes: string | null;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  assignee_id: string | null;
  assigned_by: string | null;
  assigned_at: string | null;
  source_type: TaskSourceType | null;
  source_id: string | null;
  esrs_ref: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface SuggestedTask {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  type: TaskType;
  priority: TaskPriority;
  source_type: string;
  source_id: string | null;
  esrs_ref: string | null;
  estimated_time: string | null;
  dismissed: boolean;
  dismissed_at: string | null;
  dismissed_by: string | null;
  converted_to_task_id: string | null;
  converted_at: string | null;
  created_at: string;
}

// --- Carbon Accounting ---

export type EmissionScope = '1' | '2' | '3';

export interface EmissionSource {
  id: string;
  organization_id: string;
  scope: EmissionScope;
  source_name: string;
  fuel_type: string | null;
  unit: string;
  emission_factor_value: number | null;
  emission_factor_source: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmissionEntry {
  id: string;
  organization_id: string;
  source_id: string;
  period_start: string;
  period_end: string;
  activity_data: number;
  calculated_emissions_kgco2e: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmissionFactor {
  id: string;
  fuel_type: string;
  scope: EmissionScope;
  unit: string;
  kgco2e_per_unit: number;
  source: string;
  year: number;
  region: string | null;
}

// --- Evidence Vault ---

export type StorageType = 'google_drive' | 'onedrive' | 'dropbox' | 'url' | 'supabase_storage' | 's3';
export type EvidenceLinkedToType = 'assessment' | 'kpi' | 'task' | 'emission_entry';

export interface EvidenceAttachment {
  id: string;
  organization_id: string;
  file_name: string;
  file_type: string | null;
  file_size_mb: number | null;
  storage_type: StorageType;
  external_url: string | null;
  external_id: string | null;
  storage_path: string | null;
  linked_to_type: EvidenceLinkedToType;
  linked_to_id: string;
  notes: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

// --- DMA Insight Hub ---

export type QualityCheckStatus = 'needs_fix' | 'review' | 'ok';
export type InsightActionType = 'fix' | 'comply' | 'improve';
export type InsightActionPriority = 'high' | 'medium' | 'low';

export interface QualityIssue {
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  esrs_ref: string;
  fix_suggestion: string;
}

export interface QualityCheck {
  topic: string;
  topicTitle: string;
  status: QualityCheckStatus;
  issues: QualityIssue[];
}

export interface StrategicInsight {
  summary: string;
  keyRisks: string[];
  opportunities: string[];
  bottomLine: string;
}

export interface RecommendedAction {
  id: string;
  type: InsightActionType;
  priority: InsightActionPriority;
  title: string;
  description: string;
  esrs_ref: string;
  source_type: string;
  source_id: string;
  estimated_time: string;
}

export interface InsightHubResponse {
  qualityChecks: QualityCheck[];
  strategicInsight: StrategicInsight;
  recommendedActions: RecommendedAction[];
}

// --- Notifications ---

export type NotificationChannelType = 'in_app' | 'email' | 'line' | 'slack' | 'webhook';

export interface NotificationChannel {
  id: string;
  organization_id: string;
  user_id: string | null;
  channel_type: NotificationChannelType;
  channel_config: Record<string, unknown>;
  enabled: boolean;
  notification_types: string[];
  created_at: string;
  updated_at: string;
}
