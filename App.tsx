import React, { useState, useEffect } from 'react';
import { AssessmentData, ESRSTopic, SustainabilityBusinessModel, SwotAnalysis, CompanyProfile, KPI, BSCPerspective } from './types';
import AssessmentForm from './components/AssessmentForm';
import DMAInsightHub from './components/DMAInsightHub';
import MaterialityMatrix from './components/MaterialityMatrix';
import BusinessModelCanvas from './components/BusinessModelCanvas';
import SwotAnalysisWizard from './components/SwotAnalysisWizard';
import DataCompletenessDashboard from './components/DataCompletenessDashboard';
import CompanyProfileForm from './components/CompanyProfileForm';
import PerformanceDashboard from './components/PerformanceDashboard';
import SustainabilityStatement from './components/SustainabilityStatement';
import MaterialTopicsList from './components/MaterialTopicsList';
import AuthScreen from './components/AuthScreen';
import OrgSetupScreen from './components/OrgSetupScreen';
import { useAuth } from './hooks/useAuth';
import { useOrganization } from './hooks/useOrganization';
import { useOrgData } from './hooks/useOrgData';
import {
  fromDbProfile, toDbProfile,
  fromDbCanvas, toDbCanvas,
  fromDbSwot, toDbSwot,
  fetchAssessments, upsertAssessment, deleteAssessment,
  fetchKpis, upsertKpi, deleteKpi,
} from './services/dbService';
import { setOrganizationContext } from './services/geminiService';
import { Plus, FileText, BarChart3, CheckCircle, AlertTriangle, Grid, Moon, Sun, Target, Home, ChevronRight, Building2, Menu, X, TrendingUp, ChevronsLeft, ChevronsRight, LogOut, Loader2 } from 'lucide-react';
import type { InsightHubResponse, QualityCheck } from './types';

const DEFAULT_PROFILE: CompanyProfile = {
  name: '', taxId: '', industry: '', isicCode: '', foundingYear: '',
  website: '',
  addressStreet: '', addressCity: '', addressState: '', addressPostalCode: '', addressCountry: '',
  contactEmail: '', contactPhone: '',
  employeeCount: '', revenueRange: '',
  description: '', mission: '', vision: '', productsServices: '',
};

const DEFAULT_CANVAS: SustainabilityBusinessModel = {
  keyPartners: [], keyActivities: [], keyResources: [], valueProposition: [],
  customerRelationships: [], channels: [], customerSegments: [],
  costStructure: [], revenueStreams: [], ecoSocialCosts: [], ecoSocialBenefits: [],
};

const DEFAULT_SWOT: SwotAnalysis = {
  strengths: [], weaknesses: [], opportunities: [], threats: [],
};

const App: React.FC = () => {
  const { user, isLoading: authLoading, signOut } = useAuth();
  const { organization, members, currentUserRole, isLoading: orgLoading, refetch: refetchOrg } =
    useOrganization(user?.id);

  // Personal preferences stay in localStorage (per-device, not per-org)
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem('aeternum_darkmode') === 'true'; } catch { return false; }
  });
  useEffect(() => { try { localStorage.setItem('aeternum_darkmode', String(darkMode)); } catch {} }, [darkMode]);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebarCollapsed') === 'true'; } catch { return false; }
  });
  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('sidebarCollapsed', String(next)); } catch {}
      return next;
    });
  };

  // UI state
  const [view, setView] = useState<'overview' | 'profile' | 'dm_dashboard' | 'canvas' | 'swot' | 'kpi' | 'assess' | 'report' | 'insight_hub'>('overview');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState<AssessmentData | null>(null);
  // Cached insight hub result — cleared when user explicitly re-analyses or assessments change
  const [cachedInsight, setCachedInsight] = useState<InsightHubResponse | null>(null);
  // Whether the assessment form was opened from the insight hub (to enable "back to hub" navigation)
  const [editFromHub, setEditFromHub] = useState(false);
  // Quality check context for the topic being edited from the hub — passed to AssessmentForm
  // so AI auto-fill knows which issues to address
  const [hubQualityCheck, setHubQualityCheck] = useState<QualityCheck | null>(null);

  // DB-backed singleton data (auto-save + manual save)
  const orgId = organization?.id ?? null;
  const profile = useOrgData<CompanyProfile>({
    table: 'company_profiles', orgId, defaultValue: DEFAULT_PROFILE,
    fromDb: fromDbProfile, toDb: toDbProfile,
  });
  const canvas = useOrgData<SustainabilityBusinessModel>({
    table: 'business_model_canvases', orgId, defaultValue: DEFAULT_CANVAS,
    fromDb: fromDbCanvas, toDb: toDbCanvas,
  });
  const swot = useOrgData<SwotAnalysis>({
    table: 'swot_analyses', orgId, defaultValue: DEFAULT_SWOT,
    fromDb: fromDbSwot, toDb: toDbSwot,
  });

  // DB-backed array data (explicit CRUD)
  const [assessments, setAssessments] = useState<AssessmentData[]>([]);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [arrayLoading, setArrayLoading] = useState(true);

  useEffect(() => {
    if (!orgId) { setArrayLoading(false); return; }
    let cancelled = false;
    setArrayLoading(true);
    Promise.all([fetchAssessments(orgId), fetchKpis(orgId)])
      .then(([a, k]) => {
        if (cancelled) return;
        setAssessments(a);
        setKpis(k);
      })
      .catch(err => {
        // eslint-disable-next-line no-console
        console.error('Failed to load org data:', err);
      })
      .finally(() => { if (!cancelled) setArrayLoading(false); });
    return () => { cancelled = true; };
  }, [orgId]);

  // Close mobile sidebar on route change
  useEffect(() => { setIsMobileSidebarOpen(false); }, [view]);

  // Tell the AI service which organization is active so requests carry the org_id.
  useEffect(() => { setOrganizationContext(orgId); }, [orgId]);

  const handleSaveAssessment = async (data: AssessmentData) => {
    if (!orgId) return;
    try {
      const saved = await upsertAssessment(orgId, data);
      if (editingAssessment) {
        setAssessments(prev => prev.map(a => a.id === editingAssessment.id ? saved : a));
        setEditingAssessment(null);
      } else {
        setAssessments(prev => [saved, ...prev]);
      }
      setIsFormOpen(false);
      // Assessments changed — clear cached insight so hub re-analyses next visit
      setCachedInsight(null);
      if (editFromHub) {
        setEditFromHub(false);
        setHubQualityCheck(null);
        setView('insight_hub');
      } else {
        setView('dm_dashboard');
      }
    } catch (e: any) {
      alert(`Failed to save assessment: ${e?.message ?? 'Unknown error'}`);
    }
  };

  const handleDeleteAssessment = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this assessment?')) return;
    try {
      await deleteAssessment(id);
      setAssessments(prev => prev.filter(a => a.id !== id));
    } catch (e: any) {
      alert(`Failed to delete assessment: ${e?.message ?? 'Unknown error'}`);
    }
  };

  const handleEditAssessment = (data: AssessmentData) => {
    setEditingAssessment(data);
    setIsFormOpen(true);
    setView('assess');
  };

  const handleSaveKpi = async (kpi: KPI) => {
    if (!orgId) return;
    const isNew = !kpis.some(k => k.id === kpi.id);
    const saved = await upsertKpi(orgId, kpi);
    setKpis(prev => isNew ? [...prev, saved] : prev.map(k => k.id === kpi.id ? saved : k));
  };

  const handleDeleteKpi = async (id: string) => {
    await deleteKpi(id);
    setKpis(prev => prev.filter(k => k.id !== id));
  };

  const materialTopics = assessments.filter(a => a.isMaterial);

  // ----- Loading / auth gates -----
  if (authLoading) return <FullScreenLoader label="Signing you in…" />;
  if (!user) return <AuthScreen />;
  if (orgLoading) return <FullScreenLoader label="Loading your workspace…" />;
  if (!organization) {
    return (
      <OrgSetupScreen
        userEmail={user.email ?? ''}
        onComplete={() => refetchOrg()}
        onSignOut={signOut}
      />
    );
  }

  const isDataLoading = profile.isLoading || canvas.isLoading || swot.isLoading || arrayLoading;

  return (
    <div className={`${darkMode ? 'dark' : ''}`}>
      <div className="min-h-screen flex bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition-colors duration-300">

        {isMobileSidebarOpen && (
          <div className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm" onClick={() => setIsMobileSidebarOpen(false)} />
        )}

        {/* Sidebar */}
        <aside className={`
            fixed top-0 bottom-0 left-0 z-50 bg-slate-900 dark:bg-slate-950 text-slate-300 flex flex-col border-r border-slate-800 dark:border-slate-900 overflow-hidden transition-all duration-300 ease-in-out
            ${isMobileSidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full'}
            lg:translate-x-0 lg:static lg:h-screen lg:fixed
            ${isSidebarCollapsed ? 'lg:w-20' : 'lg:w-64'}
        `}>
          <div className={`p-4 sm:p-6 border-b border-slate-800 dark:border-slate-900 flex-shrink-0 flex items-center ${isSidebarCollapsed ? 'justify-center lg:px-2' : 'justify-between'}`}>
            <div className="flex items-center gap-3 overflow-hidden">
              <img src="/favicon.png" alt="" className="w-8 h-8 flex-shrink-0" />
              <div className={`transition-opacity duration-200 ${isSidebarCollapsed ? 'lg:hidden' : 'opacity-100'}`}>
                <span className="text-white font-bold text-xl whitespace-nowrap">Aeternum Ally</span>
              </div>
            </div>
            <button onClick={() => setIsMobileSidebarOpen(false)} className="lg:hidden text-slate-400 hover:text-white">
              <X className="w-6 h-6" />
            </button>
            <button onClick={toggleSidebarCollapse} className={`hidden lg:flex p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-white transition-colors ${isSidebarCollapsed ? 'hidden' : ''}`}>
              <ChevronsLeft className="w-4 h-4" />
            </button>
          </div>

          <nav className="flex-1 p-2 sm:p-4 space-y-6 overflow-y-auto overflow-x-hidden">
            <div className="space-y-1">
              <NavItem active={view === 'overview'} collapsed={isSidebarCollapsed} onClick={() => setView('overview')} icon={<Home />} label="Overview" />
            </div>

            <div className="space-y-2">
              {!isSidebarCollapsed && <div className="px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">My Business</div>}
              {isSidebarCollapsed && <div className="h-px bg-slate-800 my-2 mx-2" />}
              <div className="space-y-1">
                <NavItem active={view === 'profile'} collapsed={isSidebarCollapsed} onClick={() => setView('profile')} icon={<Building2 />} label="Company Profile" />
                <NavItem active={view === 'canvas'} collapsed={isSidebarCollapsed} onClick={() => setView('canvas')} icon={<Grid />} label="Business Model" />
                <NavItem active={view === 'swot'} collapsed={isSidebarCollapsed} onClick={() => setView('swot')} icon={<Target />} label="SWOT Analysis" />
                <NavItem active={view === 'kpi'} collapsed={isSidebarCollapsed} onClick={() => setView('kpi')} icon={<TrendingUp />} label="Performance (KPI)" />
              </div>
            </div>

            <div className="space-y-2">
              {!isSidebarCollapsed && <div className="px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Double Materiality</div>}
              {isSidebarCollapsed && <div className="h-px bg-slate-800 my-2 mx-2" />}
              <div className="space-y-1">
                <NavItem active={view === 'dm_dashboard'} collapsed={isSidebarCollapsed} onClick={() => setView('dm_dashboard')} icon={<BarChart3 />} label="Dashboard" />
                <NavItem active={view === 'assess'} collapsed={isSidebarCollapsed} onClick={() => { setView('assess'); setIsFormOpen(false); setEditingAssessment(null); }} icon={<Plus />} label="Assessments" />
                <NavItem active={view === 'report'} collapsed={isSidebarCollapsed} onClick={() => setView('report')} icon={<FileText />} label="Reports" />
              </div>
            </div>
          </nav>

          <div className="p-4 border-t border-slate-800 dark:border-slate-900 space-y-3 flex-shrink-0">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`w-full flex items-center px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
              <span className="flex items-center gap-2">
                {darkMode ? <Moon className="w-4 h-4 text-indigo-400" /> : <Sun className="w-4 h-4 text-amber-400" />}
                {!isSidebarCollapsed && <span>{darkMode ? 'Dark Mode' : 'Light Mode'}</span>}
              </span>
              {!isSidebarCollapsed && (
                <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${darkMode ? 'bg-indigo-600' : 'bg-slate-600'}`}>
                  <div className={`w-3 h-3 bg-white rounded-full shadow-sm transform transition-transform ${darkMode ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
              )}
            </button>

            {isSidebarCollapsed && (
              <button onClick={toggleSidebarCollapse} className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-white">
                <ChevronsRight className="w-4 h-4" />
              </button>
            )}

            <div className={`flex items-center gap-3 pt-2 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
              <div className="w-8 h-8 rounded-full bg-esg-700 flex items-center justify-center text-white font-bold flex-shrink-0">
                {(user.email ?? '?').charAt(0).toUpperCase()}
              </div>
              {!isSidebarCollapsed && (
                <div className="overflow-hidden flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{user.email}</p>
                  <p className="text-xs text-slate-500 truncate">{currentUserRole ?? 'Member'} · {profile.data.name || 'Workspace'}</p>
                </div>
              )}
              {!isSidebarCollapsed && (
                <button
                  onClick={signOut}
                  title="Sign out"
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className={`flex-1 w-full transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
          <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 h-16 flex items-center justify-between px-4 md:px-8 sticky top-0 z-10 transition-colors">
            <div className="flex items-center gap-3 md:gap-4">
              <button onClick={() => setIsMobileSidebarOpen(true)} className="lg:hidden p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                <Menu className="w-6 h-6" />
              </button>
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap overflow-hidden">
                <span className="font-medium text-slate-800 dark:text-white hidden sm:inline">
                  {view === 'overview' && 'Overview'}
                  {(view === 'profile' || view === 'canvas' || view === 'swot' || view === 'kpi') && 'My Business'}
                  {(view === 'dm_dashboard' || view === 'assess' || view === 'report' || view === 'insight_hub') && 'Double Materiality'}
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
                  {view === 'insight_hub' && 'DMA Insight Hub'}
                </span>
              </div>
            </div>
            <span className="text-sm text-slate-500 dark:text-slate-400 font-medium hidden sm:inline">FY {new Date().getFullYear()}</span>
          </header>

          <div className="p-4 md:p-8 max-w-[100vw] overflow-x-hidden">
            {isDataLoading ? (
              <div className="flex items-center justify-center min-h-[400px]">
                <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Loading workspace data…
                </div>
              </div>
            ) : (
              <>
                {view === 'overview' && (
                  <DataCompletenessDashboard
                    bmcData={canvas.data}
                    swotData={swot.data}
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
                    data={profile.data}
                    onChange={profile.setData}
                    onSave={profile.save}
                    saveStatus={profile.saveStatus}
                    isDirty={profile.isDirty}
                    saveError={profile.errorMessage}
                    organizationId={organization.id}
                    currentUserId={user.id}
                    currentUserRole={currentUserRole}
                    members={members}
                    onMembersChanged={refetchOrg}
                  />
                )}

                {view === 'kpi' && (
                  <PerformanceDashboard
                    kpis={kpis}
                    onSaveKpi={handleSaveKpi}
                    onDeleteKpi={handleDeleteKpi}
                    profile={profile.data}
                  />
                )}

                {view === 'dm_dashboard' && (
                  <div className="space-y-8 animate-in fade-in duration-500">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Double Materiality Matrix</h2>
                      <button
                        onClick={() => { setView('assess'); setIsFormOpen(true); setEditingAssessment(null); }}
                        className="bg-esg-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-esg-700 transition-colors flex items-center gap-2 w-full sm:w-auto justify-center">
                        <Plus className="w-4 h-4" /> New Assessment
                      </button>
                    </div>
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
                        <MaterialTopicsList assessments={assessments} onEdit={handleEditAssessment} onDelete={handleDeleteAssessment} />
                      </div>
                    </div>
                  </div>
                )}

                {view === 'canvas' && (
                  <BusinessModelCanvas
                    data={canvas.data}
                    onChange={canvas.setData}
                    profile={profile.data}
                    saveStatus={canvas.saveStatus}
                    isDirty={canvas.isDirty}
                    onSave={canvas.save}
                    saveError={canvas.errorMessage}
                  />
                )}

                {view === 'swot' && (
                  <SwotAnalysisWizard
                    data={swot.data}
                    onChange={swot.setData}
                    profile={profile.data}
                    bmcData={canvas.data}
                    saveStatus={swot.saveStatus}
                    isDirty={swot.isDirty}
                    onSave={swot.save}
                    saveError={swot.errorMessage}
                  />
                )}

                {view === 'assess' && (
                  <div className="animate-in fade-in duration-500">
                    {!isFormOpen ? (
                      <div className="text-center py-12 px-4">
                        <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Plus className="w-8 h-8 text-slate-400" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Start a Double Materiality Assessment</h2>
                        <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-8">
                          Use our AI-assisted tool to identify impacts, risks, and opportunities based on your <strong>Business Model Canvas</strong> and ESRS guidelines.
                        </p>
                        <button onClick={() => { setIsFormOpen(true); setEditingAssessment(null); }} className="bg-esg-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-esg-700 transition-colors shadow-lg shadow-esg-900/20 w-full sm:w-auto">
                          New Assessment
                        </button>
                        <div className="mt-12 text-left w-full">
                          <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-4 mb-4">
                            <h3 className="font-bold text-slate-800 dark:text-white">Assessment History</h3>
                            {assessments.length > 0 && (
                              <button
                                onClick={() => setView('insight_hub')}
                                className="flex items-center gap-2 bg-esg-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-esg-700 transition-colors"
                              >
                                Review &amp; Continue
                                <ChevronRight className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                          {assessments.length === 0 ? (
                            <div className="p-8 text-center border border-dashed border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-slate-400">No assessments recorded yet.</div>
                          ) : (
                            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                              <MaterialTopicsList assessments={assessments} onEdit={handleEditAssessment} onDelete={handleDeleteAssessment} />
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-full">
                        <AssessmentForm
                          profile={profile.data}
                          bmcData={canvas.data}
                          swotData={swot.data}
                          onSave={handleSaveAssessment}
                          onCancel={() => {
                            setIsFormOpen(false);
                            setEditingAssessment(null);
                            if (editFromHub) {
                              setEditFromHub(false);
                              setHubQualityCheck(null);
                              setView('insight_hub');
                            }
                          }}
                          initialData={editingAssessment}
                          qualityCheckContext={editFromHub ? hubQualityCheck : null}
                        />
                      </div>
                    )}
                  </div>
                )}

                {view === 'report' && (
                  <SustainabilityStatement profile={profile.data} assessments={assessments} canvas={canvas.data} organizationId={organization.id} />
                )}

                {view === 'insight_hub' && (
                  <DMAInsightHub
                    assessments={assessments}
                    profile={profile.data}
                    bmcData={canvas.data}
                    swotData={swot.data}
                    onBack={() => setView('assess')}
                    onContinue={() => setView('kpi')}
                    cachedInsight={cachedInsight}
                    onInsightReady={setCachedInsight}
                    onEditTopic={(topicCode, qualityCheck) => {
                      const match = assessments.find(a =>
                        String(a.topic).startsWith(topicCode)
                      );
                      setEditingAssessment(match ?? null);
                      setHubQualityCheck(qualityCheck ?? null);
                      setIsFormOpen(true);
                      setEditFromHub(true);
                      setView('assess');
                    }}
                  />
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

const FullScreenLoader: React.FC<{ label?: string }> = ({ label = 'Loading…' }) => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
    <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span>{label}</span>
    </div>
  </div>
);

const NavItem = ({ active, onClick, icon, label, collapsed }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, collapsed: boolean }) => (
  <button onClick={onClick} title={collapsed ? label : ''}
    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${
      active ? 'bg-esg-600 text-white shadow-md shadow-esg-600/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
    } ${collapsed ? 'justify-center px-2' : ''}`}>
    <span className={`transition-colors ${active ? 'text-white' : 'text-slate-400 group-hover:text-white'}`}>{icon}</span>
    {!collapsed && <span className="whitespace-nowrap">{label}</span>}
  </button>
);

const StatCard = ({ title, value, icon }: { title: string, value: string, icon: React.ReactNode }) => (
  <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center gap-4 transition-colors">
    <div className="w-12 h-12 bg-slate-50 dark:bg-slate-900 rounded-full flex items-center justify-center border border-slate-100 dark:border-slate-700 flex-shrink-0">{icon}</div>
    <div className="min-w-0">
      <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{title}</p>
      <p className="text-2xl font-bold text-slate-800 dark:text-white">{value}</p>
    </div>
  </div>
);

export default App;
