import { ESRSTopic, ImpactScore, FinancialScore } from './types';

export const TOPICS = Object.values(ESRSTopic);

export const SCALE_OPTIONS = [
  { value: 1, label: 'Minimal' },
  { value: 2, label: 'Low' },
  { value: 3, label: 'Medium' },
  { value: 4, label: 'High' },
  { value: 5, label: 'Critical' },
];

export const LIKELIHOOD_OPTIONS = [
  { value: 1, label: 'Very Unlikely' },
  { value: 2, label: 'Unlikely' },
  { value: 3, label: 'Possible' },
  { value: 4, label: 'Likely' },
  { value: 5, label: 'Certain' },
];

// Simplified calculation logic based on ESRS guidelines visualization
export const calculateImpactMateriality = (score: ImpactScore): number => {
  // (Scale + Scope + Irremediability) / 3 * Likelihood -> Normalized to 0-100 approx
  const severity = (score.scale + score.scope + score.irremediability) / 3;
  return (severity * score.likelihood) * 4; // Multiplier for 0-100 scale roughly
};

export const calculateFinancialMateriality = (score: FinancialScore): number => {
  return (score.magnitude * score.likelihood) * 4; // Multiplier for 0-100 scale roughly
};

export const MATERIALITY_THRESHOLD = 40;

// --- ESRS to GRI Mapping ---
export const GRI_MAPPING: Record<string, string> = {
  [ESRSTopic.E1]: "GRI 305: Emissions, GRI 302: Energy, GRI 201-2: Climate Financial Implications",
  [ESRSTopic.E2]: "GRI 305-6: Ozone-depleting substances, GRI 305-7: NOx/SOx",
  [ESRSTopic.E3]: "GRI 303: Water and Effluents",
  [ESRSTopic.E4]: "GRI 304: Biodiversity",
  [ESRSTopic.E5]: "GRI 301: Materials, GRI 306: Waste",
  [ESRSTopic.S1]: "GRI 401: Employment, GRI 403: OHS, GRI 404: Training",
  [ESRSTopic.S2]: "GRI 414: Supplier Social Assessment",
  [ESRSTopic.S3]: "GRI 413: Local Communities",
  [ESRSTopic.S4]: "GRI 416: Customer Health and Safety",
  [ESRSTopic.G1]: "GRI 205: Anti-corruption, GRI 206: Anti-competitive Behavior",
};

// --- Company Profile Reference Data ---

export const INDUSTRY_SECTORS = [
  "Agriculture, Forestry & Fishing",
  "Mining & Quarrying",
  "Manufacturing",
  "Electricity, Gas, Steam & Air Conditioning",
  "Water Supply & Waste Management",
  "Construction",
  "Wholesale & Retail Trade",
  "Transportation & Storage",
  "Accommodation & Food Service",
  "Information & Communication",
  "Financial & Insurance Activities",
  "Real Estate Activities",
  "Professional, Scientific & Technical Activities",
  "Administrative & Support Service",
  "Education",
  "Human Health & Social Work",
  "Arts, Entertainment & Recreation",
  "Other Service Activities"
];

// Simplified ISIC Rev.4 Categories for common SME use cases
export const ISIC_CODES_GROUPED = [
  {
    category: "A - Agriculture, forestry and fishing",
    codes: [
      { code: "0111", label: "Growing of cereals (except rice), leguminous crops and oil seeds" },
      { code: "0112", label: "Growing of rice" },
      { code: "0113", label: "Growing of vegetables and melons, roots and tubers" },
      { code: "0311", label: "Marine fishing" },
      { code: "0321", label: "Marine aquaculture" }
    ]
  },
  {
    category: "C - Manufacturing",
    codes: [
      { code: "1010", label: "Processing and preserving of meat" },
      { code: "1030", label: "Processing and preserving of fruit and vegetables" },
      { code: "1071", label: "Manufacture of bakery products" },
      { code: "1311", label: "Preparation and spinning of textile fibres" },
      { code: "1410", label: "Manufacture of wearing apparel" },
      { code: "1702", label: "Manufacture of corrugated paper and paperboard" },
      { code: "2011", label: "Manufacture of basic chemicals" },
      { code: "2220", label: "Manufacture of plastics products" },
      { code: "2610", label: "Manufacture of electronic components and boards" },
      { code: "2910", label: "Manufacture of motor vehicles" },
      { code: "3100", label: "Manufacture of furniture" }
    ]
  },
  {
    category: "F - Construction",
    codes: [
      { code: "4100", label: "Construction of buildings" },
      { code: "4210", label: "Construction of roads and railways" },
      { code: "4321", label: "Electrical installation" }
    ]
  },
  {
    category: "G - Wholesale and retail trade",
    codes: [
      { code: "4610", label: "Wholesale on a fee or contract basis" },
      { code: "4711", label: "Retail sale in non-specialized stores with food, beverages" },
      { code: "4791", label: "Retail sale via mail order houses or via Internet" }
    ]
  },
  {
    category: "I - Accommodation and food service",
    codes: [
      { code: "5510", label: "Short term accommodation activities (Hotels)" },
      { code: "5610", label: "Restaurants and mobile food service activities" },
      { code: "5630", label: "Beverage serving activities" }
    ]
  },
  {
    category: "J - Information and communication",
    codes: [
      { code: "6201", label: "Computer programming activities" },
      { code: "6202", label: "Computer consultancy and computer facilities management" },
      { code: "6311", label: "Data processing, hosting and related activities" }
    ]
  },
  {
    category: "M - Professional, scientific and technical activities",
    codes: [
      { code: "6910", label: "Legal activities" },
      { code: "6920", label: "Accounting, bookkeeping and auditing activities; tax consultancy" },
      { code: "7020", label: "Management consultancy activities" },
      { code: "7110", label: "Architectural and engineering activities" }
    ]
  }
];