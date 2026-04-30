
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
  address: string;
  employeeCount: string; // Micro, Small, Medium
  revenueRange: string;
  description: string; // General Description
  mission: string;
  vision: string;
  productsServices: string; // Comma separated list
}

export interface SustainabilityBusinessModel {
  keyPartners: string;
  keyActivities: string;
  keyResources: string;
  valueProposition: string;
  customerRelationships: string;
  channels: string;
  customerSegments: string;
  costStructure: string;
  revenueStreams: string;
  ecoSocialCosts: string; // Negative impacts
  ecoSocialBenefits: string; // Positive impacts
}

export interface SwotAnalysis {
  strengths: string;
  weaknesses: string;
  opportunities: string;
  threats: string;
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
