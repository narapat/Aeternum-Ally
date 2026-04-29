
import React, { useState, useMemo, useEffect } from 'react';
import { AssessmentData, User, ESRSTopic, SustainabilityBusinessModel, SwotAnalysis, CompanyProfile, KPI, BSCPerspective } from './types';
import AssessmentForm from './components/AssessmentForm';
import MaterialityMatrix from './components/MaterialityMatrix';
import BusinessModelCanvas from './components/BusinessModelCanvas';
import SwotAnalysisWizard from './components/SwotAnalysisWizard';
import DataCompletenessDashboard from './components/DataCompletenessDashboard';
import CompanyProfileForm from './components/CompanyProfileForm';
import PerformanceDashboard from './components/PerformanceDashboard';
import SustainabilityStatement from './components/SustainabilityStatement';
import MaterialTopicsList from './components/MaterialTopicsList';
import { Layout, Plus, FileText, BarChart3, User as UserIcon, CheckCircle, AlertTriangle, Grid, Moon, Sun, Target, Home, ChevronRight, Building2, Menu, X, TrendingUp, ChevronsLeft, ChevronsRight } from 'lucide-react';

// Persistent state helper — reads from localStorage on init, writes on every change
function usePersistentState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? (JSON.parse(saved) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [key, state]);

  return [state, setState];
}

// Mock initial data
const INITIAL_USER: User = {
  name: "Sarah Jenkins",
  role: "Manager",
  companyName: "EcoTech Solutions Ltd",
  companyDescription: "A medium-sized manufacturing company producing sustainable packaging materials from recycled agricultural waste."
};

const INITIAL_PROFILE: CompanyProfile = {
  name: "EcoTech Solutions Ltd",
  taxId: "0105564000123",
  industry: "Manufacturing / Packaging",
  isicCode: "1702 - Manufacture of corrugated paper and paperboard",
  foundingYear: "2018",
  website: "https://ecotech-packaging.example.com",
  address: "88 Green Industrial Park, Rayong 21150, Thailand",
  employeeCount: "51-200",
  revenueRange: "50 MB - 300 MB",
  description: "A medium-sized manufacturing company producing sustainable packaging materials from recycled agricultural waste. We replace single-use plastics with biodegradable alternatives.",
  mission: "To eliminate single-use plastics from the food industry by 2030 through innovative agricultural upcycling.",
  vision: "To be the leading provider of carbon-negative packaging solutions in Southeast Asia.",
  productsServices: "Biodegradable food containers, Custom pulp molding, Industrial packaging liners"
};

const INITIAL_CANVAS: SustainabilityBusinessModel = {
    keyPartners: "Local farmers (agri-waste suppliers), Logistics partners, Recycling tech providers",
    keyActivities: "Pulp processing, Molding, R&D in bio-composites, Quality Control",
    keyResources: "Patented bio-processing machinery, Factory in Northern Europe, Skilled material scientists",
    valueProposition: "100% biodegradable packaging that costs the same as plastic. Reduces scope 3 emissions for clients.",
    customerRelationships: "B2B long-term contracts, Sustainability consulting support",
    channels: "Direct sales force, Sustainability expos, Digital B2B marketplace",
    customerSegments: "FMCG Brands, Cosmetic companies, Organic food producers",
    costStructure: "Raw material procurement, Energy (high but moving to renewable), Labor",
    revenueStreams: "Product sales, Custom mold design fees",
    ecoSocialCosts: "High water usage in processing, Transportation emissions",
    ecoSocialBenefits: "Diversion of agricultural waste from burning, Plastic reduction, Rural employment"
};

const INITIAL_SWOT: SwotAnalysis = {
  strengths: "",
  weaknesses: "",
  opportunities: "",
  threats: ""
};

const INITIAL_KPIS: KPI[] = [
    {
        id: 'k1',
        name: 'Revenue from Green Products',
        description: 'Revenue generated strictly from biodegradable product lines.',
        perspective: BSCPerspective.FINANCIAL,
        frequency: 'Quarterly',
        unit: 'MB THB',
        targetValue: 50,
        currentValue: 35,
        linkedKpiIds: [],
        raci: { responsible: 'Sales Director', accountable: 'CEO', consulted: 'CFO', informed: 'Board' },
        history: []
    },
    {
        id: 'k2',
        name: 'Customer Satisfaction Score (CSAT)',
        description: 'Average rating from B2B clients regarding product quality and delivery.',
        perspective: BSCPerspective.CUSTOMER,
        frequency: 'Quarterly',
        unit: 'Score',
        targetValue: 4.5,
        currentValue: 4.2,
        linkedKpiIds: ['k1'],
        raci: { responsible: 'Account Manager', accountable: 'Sales Director', consulted: 'QC Team', informed: 'Production' },
        history: []
    },
    {
        id: 'k3',
        name: 'Production Waste Recycling Rate',
        description: 'Percentage of internal production waste reintroduced into the cycle.',
        perspective: BSCPerspective.INTERNAL,
        frequency: 'Monthly',
        unit: '%',
        targetValue: 95,
        currentValue: 88,
        linkedKpiIds: ['k1', 'k2'],
        raci: { responsible: 'Plant Manager', accountable: 'COO', consulted: 'Sustainability Officer', informed: 'Employees' },
        history: []
    }
];

const App: React.FC = () => {
  // 'overview' is the new landing page. 'profile' is the new company profile module.
  const [view, setView] = useState<'overview' | 'profile' | 'dm_dashboard' | 'canvas' | 'swot' | 'kpi' | 'assess' | 'report'>('overview');
  const [assessments, setAssessments] = usePersistentState<AssessmentData[]>('aeternum_assessments', []);
  const [canvasData, setCanvasData] = usePersistentState<SustainabilityBusinessModel>('aeternum_canvas', INITIAL_CANVAS);
  const [swotData, setSwotData] = usePersistentState<SwotAnalysis>('aeternum_swot', INITIAL_SWOT);
  const [companyProfile, setCompanyProfile] = usePersistentState<CompanyProfile>('aeternum_profile', INITIAL_PROFILE);
  const [kpis, setKpis] = usePersistentState<KPI[]>('aeternum_kpis', INITIAL_KPIS);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [darkMode, setDarkMode] = usePersistentState<boolean>('aeternum_darkmode', false);
  const [editingAssessment, setEditingAssessment] = useState<AssessmentData | null>(null);
  
  // Sidebar States
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  // Load collapsed state from localStorage
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem('sidebarCollapsed');
      return saved === 'true';
    } catch {
      return false;
    }
  });

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed(prev => {
      const newState = !prev;
      localStorage.setItem('sidebarCollapsed', String(newState));
      return newState;
    });
  };

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [view]);

  const handleSaveAssessment = (data: AssessmentData) => {
    if (editingAssessment) {
        // Update existing
        setAssessments(prev => prev.map(a => a.id === data.id ? data : a));
        setEditingAssessment(null);
    } else {
        // Create new
        setAssessments(prev => [...prev, data]);
    }
    setIsFormOpen(false);
    setView('dm_dashboard');
  };

  const handleDeleteAssessment = (id: string) => {
    if (window.confirm('Are you sure you want to delete this assessment?')) {
        setAssessments(prev => prev.filter(a => a.id !== id));
    }
  };

  const handleEditAssessment = (data: AssessmentData) => {
    setEditingAssessment(data);
    setIsFormOpen(true);
    setView('assess'); // Ensure context is correct though form is overlay in some logic, here using dedicated view logic mostly
  };

  const materialTopics = assessments.filter(a => a.isMaterial);

  // Synthesize a rich description from the Canvas data AND Company Profile for the AI
  const derivedCompanyDescription = useMemo(() => {
    return `
      Company: ${companyProfile.name} (Tax ID: ${companyProfile.taxId}).
      Industry: ${companyProfile.industry} (ISIC: ${companyProfile.isicCode}).
      Scale: ${companyProfile.employeeCount} employees, Revenue: ${companyProfile.revenueRange}.
      Description: ${companyProfile.description}.
      Mission: ${companyProfile.mission}.
      Vision: ${companyProfile.vision}.
      Key Products: ${companyProfile.productsServices}.
      
      Business Model Context:
      Value Proposition: ${canvasData.valueProposition}.
      Key Activities: ${canvasData.keyActivities}.
      Partners: ${canvasData.keyPartners}.
      Resources: ${canvasData.keyResources}.
      Target Customers: ${canvasData.customerSegments}.
      Eco-Social Benefits: ${canvasData.ecoSocialBenefits}.
      Eco-Social Costs: ${canvasData.ecoSocialCosts}.
    `.trim();
  }, [canvasData, companyProfile]);

  return (
    <div className={`${darkMode ? 'dark' : ''}`}>
      <div className="min-h-screen flex bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition-colors duration-300">
        
        {/* Mobile Sidebar Overlay */}
        {isMobileSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm transition-opacity"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={`
            fixed top-0 bottom-0 left-0 z-50 bg-slate-900 dark:bg-slate-950 text-slate-300 flex flex-col border-r border-slate-800 dark:border-slate-900 overflow-hidden transition-all duration-300 ease-in-out
            ${isMobileSidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full'}
            lg:translate-x-0 lg:static lg:h-screen lg:fixed
            ${isSidebarCollapsed ? 'lg:w-20' : 'lg:w-64'}
        `}>
          {/* Header & Logo */}
          <div className={`p-4 sm:p-6 border-b border-slate-800 dark:border-slate-900 flex-shrink-0 flex items-center ${isSidebarCollapsed ? 'justify-center lg:px-2' : 'justify-between'}`}>
            <div className="flex items-center gap-3 overflow-hidden">
                <Layout className="w-6 h-6 text-esg-500 flex-shrink-0" />
                <div className={`transition-opacity duration-200 ${isSidebarCollapsed ? 'lg:hidden' : 'opacity-100'}`}>
                    <span className="text-white font-bold text-xl whitespace-nowrap">Aeternum Ally</span>
                </div>
            </div>
            
            {/* Mobile Close Button */}
            <button onClick={() => setIsMobileSidebarOpen(false)} className="lg:hidden text-slate-400 hover:text-white">
                <X className="w-6 h-6" />
            </button>

            {/* Desktop Collapse Toggle */}
            <button 
              onClick={toggleSidebarCollapse} 
              className={`hidden lg:flex p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-white transition-colors ${isSidebarCollapsed ? 'hidden' : ''}`}
            >
               <ChevronsLeft className="w-4 h-4" />
            </button>
          </div>
          
          {/* Navigation */}
          <nav className="flex-1 p-2 sm:p-4 space-y-6 overflow-y-auto overflow-x-hidden">
            
            {/* Overview Section */}
            <div className="space-y-1">
                <NavItem active={view === 'overview'} collapsed={isSidebarCollapsed} onClick={() => setView('overview')} icon={<Home />} label="Overview" />
            </div>

            {/* Group: My Business */}
            <div className="space-y-2">
                {!isSidebarCollapsed && (
                  <div className="px-4 text-xs font-bold text-slate-500 uppercase tracking-wider animate-in fade-in duration-200">My Business</div>
                )}
                {isSidebarCollapsed && <div className="h-px bg-slate-800 my-2 mx-2"></div>}
                <div className="space-y-1">
                    <NavItem active={view === 'profile'} collapsed={isSidebarCollapsed} onClick={() => setView('profile')} icon={<Building2 />} label="Company Profile" />
                    <NavItem active={view === 'canvas'} collapsed={isSidebarCollapsed} onClick={() => setView('canvas')} icon={<Grid />} label="Business Model" />
                    <NavItem active={view === 'swot'} collapsed={isSidebarCollapsed} onClick={() => setView('swot')} icon={<Target />} label="SWOT Analysis" />
                    <NavItem active={view === 'kpi'} collapsed={isSidebarCollapsed} onClick={() => setView('kpi')} icon={<TrendingUp />} label="Performance (KPI)" />
                </div>
            </div>

            {/* Group: Double Materiality */}
            <div className="space-y-2">
                 {!isSidebarCollapsed && (
                  <div className="px-4 text-xs font-bold text-slate-500 uppercase tracking-wider animate-in fade-in duration-200">Double Materiality</div>
                 )}
                 {isSidebarCollapsed && <div className="h-px bg-slate-800 my-2 mx-2"></div>}
                <div className="space-y-1">
                    <NavItem active={view === 'dm_dashboard'} collapsed={isSidebarCollapsed} onClick={() => setView('dm_dashboard')} icon={<BarChart3 />} label="Dashboard" />
                    <NavItem active={view === 'assess'} collapsed={isSidebarCollapsed} onClick={() => { setView('assess'); setIsFormOpen(false); setEditingAssessment(null); }} icon={<Plus />} label="Assessments" />
                    <NavItem active={view === 'report'} collapsed={isSidebarCollapsed} onClick={() => setView('report')} icon={<FileText />} label="Reports" />
                </div>
            </div>
          </nav>

          {/* Footer / User Profile */}
          <div className="p-4 border-t border-slate-800 dark:border-slate-900 space-y-4 flex-shrink-0">
             {/* Dark Mode Toggle */}
            <button 
                onClick={() => setDarkMode(!darkMode)}
                className={`w-full flex items-center px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}
                title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
                <span className={`flex items-center gap-2 ${isSidebarCollapsed ? '' : ''}`}>
                    {darkMode ? <Moon className="w-4 h-4 text-indigo-400" /> : <Sun className="w-4 h-4 text-amber-400" />}
                    {!isSidebarCollapsed && <span>{darkMode ? 'Dark Mode' : 'Light Mode'}</span>}
                </span>
                {!isSidebarCollapsed && (
                    <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${darkMode ? 'bg-indigo-600' : 'bg-slate-600'}`}>
                        <div className={`w-3 h-3 bg-white rounded-full shadow-sm transform transition-transform ${darkMode ? 'translate-x-4' : 'translate-x-0'}`} />
                    </div>
                )}
            </button>
            
            {/* Collapse Toggle (Collapsed State only) */}
            {isSidebarCollapsed && (
              <button 
                onClick={toggleSidebarCollapse} 
                className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-white transition-colors"
              >
                 <ChevronsRight className="w-4 h-4" />
              </button>
            )}

            <div className={`flex items-center gap-3 pt-2 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
                <div className="w-8 h-8 rounded-full bg-esg-700 flex items-center justify-center text-white font-bold flex-shrink-0">
                    {INITIAL_USER.name.charAt(0)}
                </div>
                {!isSidebarCollapsed && (
                    <div className="overflow-hidden animate-in fade-in duration-200">
                        <p className="text-sm font-medium text-white truncate">{INITIAL_USER.name}</p>
                        <p className="text-xs text-slate-500 truncate">{companyProfile.name}</p>
                    </div>
                )}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className={`
            flex-1 w-full transition-all duration-300
            ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}
        `}>
          <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 h-16 flex items-center justify-between px-4 md:px-8 sticky top-0 z-10 transition-colors">
              <div className="flex items-center gap-3 md:gap-4">
                  {/* Hamburger Button */}
                  <button 
                    onClick={() => setIsMobileSidebarOpen(true)}
                    className="lg:hidden p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                  >
                    <Menu className="w-6 h-6" />
                  </button>

                  <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap overflow-hidden">
                      <span className="font-medium text-slate-800 dark:text-white hidden sm:inline">
                        {view === 'overview' && 'Overview'}
                        {(view === 'profile' || view === 'canvas' || view === 'swot' || view === 'kpi') && 'My Business'}
                        {(view === 'dm_dashboard' || view === 'assess' || view === 'report') && 'Double Materiality'}
                      </span>
                      <ChevronRight className="w-4 h-4 hidden sm:block" />
                      <span className="truncate">
                          {view === 'overview' && 'System Status'}
                          {view === 'profile' && 'Company Profile'}
                          {view === 'canvas' && 'Business Model Canvas'}
                          {view === 'swot' && 'SWOT Analysis'}
                          {view === 'kpi' && 'Performance Management'}
                          {view === 'dm_dashboard' && 'Materiality Dashboard'}
                          {view === 'assess' && 'Materiality Assessments'}
                          {view === 'report' && 'Sustainability Statement'}
                      </span>
                  </div>
              </div>
              <div className="flex items-center gap-4">
                  <span className="text-sm text-slate-500 dark:text-slate-400 font-medium hidden sm:inline">FY 2024-2025</span>
              </div>
          </header>

          <div className="p-4 md:p-8 max-w-[100vw] overflow-x-hidden">
              {view === 'overview' && (
                <DataCompletenessDashboard 
                    bmcData={canvasData}
                    swotData={swotData}
                    assessments={assessments}
                    onNavigate={(v) => {
                        setView(v);
                        if (v === 'assess') {
                            setIsFormOpen(true);
                            setEditingAssessment(null);
                        }
                    }}
                />
              )}

              {view === 'profile' && (
                <CompanyProfileForm 
                  data={companyProfile} 
                  onSave={(updated) => {
                    setCompanyProfile(updated);
                    // Could add toast notification here
                  }} 
                />
              )}

              {view === 'kpi' && (
                  <PerformanceDashboard 
                    kpis={kpis}
                    setKpis={setKpis}
                    companyDescription={derivedCompanyDescription}
                  />
              )}

              {view === 'dm_dashboard' && (
                  <div className="space-y-8 animate-in fade-in duration-500">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Double Materiality Matrix</h2>
                        <button 
                            onClick={() => { setView('assess'); setIsFormOpen(true); setEditingAssessment(null); }}
                            className="bg-esg-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-esg-700 transition-colors flex items-center gap-2 w-full sm:w-auto justify-center"
                        >
                            <Plus className="w-4 h-4" /> New Assessment
                        </button>
                      </div>

                      {/* Stats Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
                          <StatCard title="Assessments Completed" value={assessments.length.toString()} icon={<FileText className="text-blue-500" />} />
                          <StatCard title="Material Topics Identified" value={materialTopics.length.toString()} icon={<AlertTriangle className="text-amber-500" />} />
                          <StatCard title="High Impact Risks" value={assessments.filter(a => a.financialMaterialityValue > 60).length.toString()} icon={<CheckCircle className="text-esg-500" />} />
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                          <div className="lg:col-span-2 min-h-[300px]">
                              <MaterialityMatrix data={assessments} />
                          </div>
                          <div className="min-h-[400px]">
                              <MaterialTopicsList 
                                assessments={assessments} 
                                onEdit={handleEditAssessment}
                                onDelete={handleDeleteAssessment}
                              />
                          </div>
                      </div>
                  </div>
              )}

              {view === 'canvas' && (
                  <BusinessModelCanvas 
                    data={canvasData} 
                    onChange={setCanvasData} 
                    companyName={companyProfile.name}
                    companyDescription={derivedCompanyDescription}
                  />
              )}

              {view === 'swot' && (
                <SwotAnalysisWizard 
                  data={swotData}
                  onChange={setSwotData}
                  companyName={companyProfile.name}
                  companyDescription={derivedCompanyDescription}
                  bmcData={canvasData}
                />
              )}

              {view === 'assess' && (
                  <div className="animate-in fade-in duration-500">
                      {!isFormOpen ? (
                          <div className="text-center py-12 px-4">
                              <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 transition-colors">
                                  <Plus className="w-8 h-8 text-slate-400" />
                              </div>
                              <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Start a Double Materiality Assessment</h2>
                              <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-8">
                                  Use our AI-assisted tool to identify impacts, risks, and opportunities based on your <strong>Business Model Canvas</strong> and ESRS guidelines.
                              </p>
                              <button 
                                  onClick={() => { setIsFormOpen(true); setEditingAssessment(null); }}
                                  className="bg-esg-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-esg-700 transition-colors shadow-lg shadow-esg-900/20 w-full sm:w-auto"
                              >
                                  New Assessment
                              </button>

                              <div className="mt-12 text-left max-w-5xl mx-auto">
                                  <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-4 mb-4">
                                     <h3 className="font-bold text-slate-800 dark:text-white">Assessment History</h3>
                                  </div>
                                  
                                  {assessments.length === 0 ? (
                                      <div className="p-8 text-center border border-dashed border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-slate-400 transition-colors">No assessments recorded yet.</div>
                                  ) : (
                                      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden transition-colors">
                                          <MaterialTopicsList 
                                            assessments={assessments} 
                                            onEdit={handleEditAssessment}
                                            onDelete={handleDeleteAssessment}
                                          />
                                      </div>
                                  )}
                              </div>
                          </div>
                      ) : (
                          <div className="max-w-3xl mx-auto">
                             <AssessmentForm 
                                companyDescription={derivedCompanyDescription}
                                onSave={handleSaveAssessment}
                                onCancel={() => { setIsFormOpen(false); setEditingAssessment(null); }}
                                initialData={editingAssessment}
                            />
                          </div>
                      )}
                  </div>
              )}
              
              {view === 'report' && (
                  <SustainabilityStatement 
                      profile={companyProfile} 
                      assessments={assessments} 
                      canvas={canvasData} 
                  />
              )}
          </div>
        </main>
      </div>
    </div>
  );
};

const NavItem = ({ active, onClick, icon, label, collapsed }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, collapsed: boolean }) => (
  <button 
    onClick={onClick}
    title={collapsed ? label : ''}
    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${
      active 
      ? 'bg-esg-600 text-white shadow-md shadow-esg-600/20' 
      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
    } ${collapsed ? 'justify-center px-2' : ''}`}
  >
    <span className={`transition-colors ${active ? 'text-white' : 'text-slate-400 group-hover:text-white'}`}>
        {icon}
    </span>
    {!collapsed && <span className="whitespace-nowrap animate-in fade-in duration-300 origin-left">{label}</span>}
  </button>
);

const StatCard = ({ title, value, icon }: { title: string, value: string, icon: React.ReactNode }) => (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center gap-4 transition-colors">
        <div className="w-12 h-12 bg-slate-50 dark:bg-slate-900 rounded-full flex items-center justify-center border border-slate-100 dark:border-slate-700 flex-shrink-0">
            {icon}
        </div>
        <div className="min-w-0">
            <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{title}</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-white">{value}</p>
        </div>
    </div>
);

export default App;
