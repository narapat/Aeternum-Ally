import React, { useState, useEffect } from 'react';
import { AssessmentData, ESRSTopic, SustainabilityBusinessModel, SwotAnalysis, CompanyProfile, KPI, BSCPerspective, Task } from './types';
import AssessmentForm from './components/AssessmentForm';
import DMAInsightHub from './components/DMAInsightHub';
import TaskManagement from './components/TaskManagement';
import CarbonWizard from './components/CarbonWizard';
import CarbonDashboard from './components/CarbonDashboard';
import MaterialityMatrix from './components/MaterialityMatrix';
import DMAGuide from './components/DMAGuide';
import BusinessModelCanvas from './components/BusinessModelCanvas';
import SwotAnalysisWizard from './components/SwotAnalysisWizard';
import DataCompletenessDashboard from './components/DataCompletenessDashboard';
import CompanyProfileForm from './components/CompanyProfileForm';
import SettingsDashboard from './components/SettingsDashboard';
import UserProfilePage from './components/UserProfilePage';
import PerformanceDashboard from './components/PerformanceDashboard';
import SustainabilityStatement from './components/SustainabilityStatement';
import MaterialTopicsList from './components/MaterialTopicsList';
import StartHere from './components/StartHere';
import type { StartHerePathId } from './components/StartHere';
import StartHerePath from './components/StartHerePath';
import AllyAssistant from './components/AllyAssistant';
import AuthScreen from './components/AuthScreen';
import ResetPasswordModal from './components/ResetPasswordModal';
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
  saveQualityCheck, saveDMAInsight, clearDMAInsight, loadDMAInsight, saveDMASuggestedTasks, fetchTasks
} from './services/dbService';
import { setOrganizationContext } from './services/geminiService';
import { supabase } from './lib/supabaseClient';
import { Plus, FileText, BarChart3, CheckCircle, AlertTriangle, Grid, Moon, Sun, Target, Home, ChevronRight, ChevronDown, Building2, Menu, X, TrendingUp, ChevronsLeft, ChevronsRight, LogOut, Loader2, ListChecks, Zap, Leaf, Settings, UserCircle, ChevronUp, ScatterChart, Compass } from 'lucide-react';
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

  const currentMemberId = members.find(m => m.user_id === user?.id)?.id ?? null;

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

  // Password recovery — shown when Supabase fires a PASSWORD_RECOVERY event
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setShowPasswordReset(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (organization?.id) {
      fetchTasks(organization.id).then(setTasks);
    }
  }, [organization?.id]);

  // UI state
  const [view, setView] = useState<'start_here' | 'start_here_esg' | 'start_here_carbon' | 'start_here_stakeholder' | 'overview' | 'profile' | 'dm_dashboard' | 'canvas' | 'swot' | 'kpi' | 'assess' | 'report' | 'insight_hub' | 'tasks' | 'carbon_wizard' | 'carbon_dashboard' | 'settings' | 'user_profile'>('overview');
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
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
  const [targetKpiId, setTargetKpiId] = useState<string | null>(null);
  const [targetTaskId, setTargetTaskId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);

  // Sidebar nav group open/close state — persisted per-device in localStorage
  const [myBusinessOpen, setMyBusinessOpen] = useState(() => {
    try { return localStorage.getItem('nav_myBusiness') !== 'false'; } catch { return true; }
  });
  const [doubleMaterialityOpen, setDoubleMaterialityOpen] = useState(() => {
    try { return localStorage.getItem('nav_doubleMateriality') !== 'false'; } catch { return true; }
  });
  const [measurementOpen, setMeasurementOpen] = useState(() => {
    try { return localStorage.getItem('nav_measurement') !== 'false'; } catch { return true; }
  });
  useEffect(() => { try { localStorage.setItem('nav_myBusiness', String(myBusinessOpen)); } catch {} }, [myBusinessOpen]);
  useEffect(() => { try { localStorage.setItem('nav_doubleMateriality', String(doubleMaterialityOpen)); } catch {} }, [doubleMaterialityOpen]);
  useEffect(() => { try { localStorage.setItem('nav_measurement', String(measurementOpen)); } catch {} }, [measurementOpen]);

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
    Promise.all([fetchAssessments(orgId), fetchKpis(orgId), loadDMAInsight(orgId)])
      .then(([a, k, insight]) => {
        if (cancelled) return;
        setAssessments(a);
        setKpis(k);
        setCachedInsight(insight);
      })
      .catch(err => {
        // eslint-disable-next-line no-console
        console.error('Failed to load org data:', err);
      })
      .finally(() => { if (!cancelled) setArrayLoading(false); });
    return () => { cancelled = true; };
  }, [orgId]);

  // Close mobile sidebar and user dropdown on route change
  useEffect(() => { setIsMobileSidebarOpen(false); setUserDropdownOpen(false); }, [view]);

  // Handle Google Drive OAuth callback redirect (?google_drive=connected|error)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gd = params.get('google_drive');
    if (!gd) return;
    // Clean the query string without a page reload
    const clean = window.location.pathname;
    window.history.replaceState({}, '', clean);
    if (gd === 'connected') {
      // Show a brief success toast — re-use the existing alert for now
      // (a toast library can be added later if desired)
      console.info('Google Drive connected successfully.');
    } else if (gd === 'error') {
      const msg = params.get('message') ?? 'Google Drive connection failed.';
      alert(`Google Drive: ${decodeURIComponent(msg)}`);
    }
  }, []);

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
      // Assessments changed — clear cached insight so hub re-analyses fresh on next visit.
      setCachedInsight(null);
      if (orgId) clearDMAInsight(orgId);
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

  // Password recovery modal — shown over any view when user follows a reset link
  if (showPasswordReset) return <ResetPasswordModal onDone={() => setShowPasswordReset(false)} />;
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
              <div className={`transition-opacity duration-200 ${isSidebarCollapsed ? 'lg:hidden' : 'opacity-100'} flex items-baseline gap-2`}>
                <span className="text-white font-bold text-xl whitespace-nowrap">Aeternum Ally</span>
                <span className="text-slate-400 text-xs font-semibold whitespace-nowrap">v 1.1.0</span>
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
              <NavItem active={view === 'start_here' || view === 'start_here_esg' || view === 'start_here_carbon' || view === 'start_here_stakeholder'} collapsed={isSidebarCollapsed} onClick={() => setView('start_here')} icon={<Compass />} label="Start Here" />
              <NavItem active={view === 'overview'} collapsed={isSidebarCollapsed} onClick={() => setView('overview')} icon={<Home />} label="Overview" />
            </div>

            <NavSection label="My Business" open={myBusinessOpen} onToggle={() => setMyBusinessOpen(v => !v)} sidebarCollapsed={isSidebarCollapsed}>
              <NavItem active={view === 'profile'} collapsed={isSidebarCollapsed} onClick={() => setView('profile')} icon={<Building2 />} label="Company Profile" />
              <NavItem active={view === 'canvas'} collapsed={isSidebarCollapsed} onClick={() => setView('canvas')} icon={<Grid />} label="Business Model" />
              <NavItem active={view === 'swot'} collapsed={isSidebarCollapsed} onClick={() => setView('swot')} icon={<Target />} label="SWOT Analysis" />
            </NavSection>

            <NavSection label="Double Materiality" open={doubleMaterialityOpen} onToggle={() => setDoubleMaterialityOpen(v => !v)} sidebarCollapsed={isSidebarCollapsed}>
              <NavItem active={view === 'dm_dashboard'} collapsed={isSidebarCollapsed} onClick={() => setView('dm_dashboard')} icon={<ScatterChart />} label="Dashboard" />
              <NavItem active={view === 'assess'} collapsed={isSidebarCollapsed} onClick={() => { setView('assess'); setIsFormOpen(false); setEditingAssessment(null); }} icon={<Plus />} label="Assessments" />
              <NavItem active={view === 'insight_hub'} collapsed={isSidebarCollapsed} onClick={() => setView('insight_hub')} icon={<Zap className="w-5 h-5" />} label="Insight Hub" />
            </NavSection>

            <NavSection label="Measurement" open={measurementOpen} onToggle={() => setMeasurementOpen(v => !v)} sidebarCollapsed={isSidebarCollapsed}>
              <NavItem active={view === 'kpi'} collapsed={isSidebarCollapsed} onClick={() => setView('kpi')} icon={<TrendingUp />} label="Performance (KPI)" />
              <NavItem active={view === 'tasks'} collapsed={isSidebarCollapsed} onClick={() => setView('tasks')} icon={<ListChecks />} label="Tasks" />
              <NavItem active={view === 'carbon_wizard'} collapsed={isSidebarCollapsed} onClick={() => setView('carbon_wizard')} icon={<Leaf />} label="Carbon Quest" />
              <NavItem active={view === 'carbon_dashboard'} collapsed={isSidebarCollapsed} onClick={() => setView('carbon_dashboard')} icon={<BarChart3 />} label="Carbon Dashboard" />
            </NavSection>

            <div className="space-y-1">
              <NavItem active={view === 'report'} collapsed={isSidebarCollapsed} onClick={() => setView('report')} icon={<FileText />} label="Reports" />
            </div>

          </nav>

          {/* Version */}
          <div className="p-2 text-xs text-slate-600 dark:text-slate-500 text-center border-t border-slate-800 dark:border-slate-900 flex-shrink-0">
            {isSidebarCollapsed ? 'v1.1.0' : 'Version 1.1.0'}
          </div>

          {/* Expand button — only shown when sidebar is collapsed */}
          {isSidebarCollapsed && (
            <div className="p-2 flex-shrink-0">
              <button onClick={toggleSidebarCollapse} className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-white transition-colors">
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </aside>

        {/* Main content */}
        <main className={`flex-1 w-full transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
          <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 h-16 flex items-center justify-between px-4 md:px-8 sticky top-0 z-30 transition-colors">
            <div className="flex items-center gap-3 md:gap-4">
              <button onClick={() => setIsMobileSidebarOpen(true)} className="lg:hidden p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                <Menu className="w-6 h-6" />
              </button>
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap overflow-hidden">
                <span className="font-medium text-slate-800 dark:text-white hidden sm:inline">
                  {(view === 'start_here' || view === 'start_here_esg' || view === 'start_here_carbon' || view === 'start_here_stakeholder') && 'Start Here'}
                  {view === 'overview' && 'Overview'}
                  {(view === 'profile' || view === 'canvas' || view === 'swot' || view === 'kpi') && 'My Business'}
                  {(view === 'dm_dashboard' || view === 'assess' || view === 'report' || view === 'insight_hub') && 'Double Materiality'}
                  {view === 'tasks' && 'Action Plan'}
                  {(view === 'carbon_wizard' || view === 'carbon_dashboard') && 'Carbon Accounting'}
                  {view === 'settings' && 'Workspace'}
                  {view === 'user_profile' && 'Account'}
                </span>
                <ChevronRight className="w-4 h-4 hidden sm:block" />
                <span className="truncate">
                  {view === 'start_here' && 'Choose Your Path'}
                  {view === 'start_here_esg' && 'ESG Readiness'}
                  {view === 'start_here_carbon' && 'Carbon Starter'}
                  {view === 'start_here_stakeholder' && 'Stakeholder Request Readiness'}
                  {view === 'overview' && 'System Status'}
                  {view === 'profile' && 'Company Profile'}
                  {view === 'canvas' && 'Business Model Canvas'}
                  {view === 'swot' && 'SWOT Analysis'}
                  {view === 'kpi' && 'Performance Management'}
                  {view === 'dm_dashboard' && 'Materiality Dashboard'}
                  {view === 'assess' && 'Materiality Assessments'}
                  {view === 'report' && 'Sustainability Statement'}
                  {view === 'insight_hub' && 'DMA Insight Hub'}
                  {view === 'tasks' && 'Task Management'}
                  {view === 'carbon_wizard' && 'Carbon Quest Wizard'}
                  {view === 'carbon_dashboard' && 'Carbon Dashboard'}
                  {view === 'settings' && 'Settings'}
                  {view === 'user_profile' && 'My Profile'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500 dark:text-slate-400 font-medium hidden sm:inline">FY {new Date().getFullYear()}</span>

              {/* User avatar — clicking opens dropdown */}
              <div className="relative">
                <button
                  onClick={() => setUserDropdownOpen(v => !v)}
                  title={user.email ?? ''}
                  className="flex items-center gap-1.5 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-esg-700 flex items-center justify-center text-white flex-shrink-0">
                    <UserCircle className="w-5 h-5" />
                  </div>
                  {userDropdownOpen
                    ? <ChevronUp className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    : <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  }
                </button>

                {/* Dropdown */}
                {userDropdownOpen && (
                  <div className="absolute top-full right-0 mt-1 w-56 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">

                    {/* Identity header */}
                    <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                      <p className="text-sm font-medium text-slate-800 dark:text-white truncate">{user.email}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {currentUserRole ?? 'Member'} · {profile.data.name || 'Workspace'}
                      </p>
                    </div>

                    {/* My Profile */}
                    <button
                      onClick={() => { setView('user_profile'); setUserDropdownOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition-colors"
                    >
                      <UserCircle className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      My Profile
                    </button>

                    {/* Dark / Light mode toggle */}
                    <button
                      onClick={() => setDarkMode(v => !v)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition-colors"
                    >
                      <span className="flex items-center gap-3">
                        {darkMode
                          ? <Moon className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                          : <Sun className="w-4 h-4 text-amber-500 flex-shrink-0" />
                        }
                        {darkMode ? 'Dark Mode' : 'Light Mode'}
                      </span>
                      <div className={`w-8 h-4 rounded-full p-0.5 transition-colors flex-shrink-0 ${darkMode ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                        <div className={`w-3 h-3 bg-white rounded-full shadow-sm transform transition-transform ${darkMode ? 'translate-x-4' : 'translate-x-0'}`} />
                      </div>
                    </button>

                    {/* Settings — Owner / Admin only */}
                    {(currentUserRole === 'Owner' || currentUserRole === 'Admin') && (
                      <button
                        onClick={() => { setView('settings'); setUserDropdownOpen(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition-colors"
                      >
                        <Settings className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        Settings
                      </button>
                    )}

                    {/* Sign out */}
                    <button
                      onClick={signOut}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition-colors border-t border-slate-100 dark:border-slate-700"
                    >
                      <LogOut className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
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
                {view === 'start_here' && (
                  <StartHere onSelectPath={(path: StartHerePathId) => setView(path)} />
                )}

                {(view === 'start_here_esg' || view === 'start_here_carbon' || view === 'start_here_stakeholder') && (
                  <StartHerePath
                    pathId={view}
                    onBack={() => setView('start_here')}
                    onNavigate={(v) => setView(v)}
                  />
                )}

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
                    tasks={tasks}
                    currentMemberId={currentMemberId}
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
                    onOpenSettings={() => setView('settings')}
                  />
                )}

                {view === 'kpi' && (
                  <PerformanceDashboard
                    kpis={kpis}
                    onSaveKpi={handleSaveKpi}
                    onDeleteKpi={handleDeleteKpi}
                    profile={profile.data}
                    orgId={organization?.id}
                    currentUserId={user?.id}
                    openKpiId={targetKpiId}
                    onNavigateToTask={(taskId) => {
                      setTargetTaskId(taskId);
                      setView('tasks');
                    }}
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
                      <StatCard title="Assessments Completed" value={assessments.length.toString()} icon={<FileText className="text-blue-500" />} description="Total ESRS topics assessed across all categories" />
                      <StatCard title="Material Topics Identified" value={materialTopics.length.toString()} icon={<AlertTriangle className="text-amber-500" />} description="Topics scoring ≥ 40 on financial or impact materiality" />
                      <StatCard title="High Impact Risks" value={assessments.filter(a => a.financialMaterialityValue > 60).length.toString()} icon={<CheckCircle className="text-esg-500" />} description="Topics with financial materiality score > 60 (green dots on matrix)" />
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <div className="lg:col-span-2">
                        <MaterialityMatrix data={assessments} />
                      </div>
                      <div className="lg:col-span-1">
                        <DMAGuide profile={profile.data} />
                      </div>
                    </div>
                    <div className="mt-6">
                      <MaterialTopicsList assessments={assessments} onEdit={handleEditAssessment} onDelete={handleDeleteAssessment} orgId={organization?.id} currentUserId={user?.id} />
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
                      <div className="space-y-4">
                        {/* Action bar */}
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <button
                            onClick={() => { setIsFormOpen(true); setEditingAssessment(null); }}
                            className="flex items-center gap-2 bg-esg-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-esg-700 transition-colors"
                          >
                            <Plus className="w-4 h-4" /> New Assessment
                          </button>
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

                        {/* List */}
                        {assessments.length === 0 ? (
                          <div className="p-8 text-center border border-dashed border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-slate-400">No assessments recorded yet. Click <strong>New Assessment</strong> to get started.</div>
                        ) : (
                          <MaterialTopicsList assessments={assessments} onEdit={handleEditAssessment} onDelete={handleDeleteAssessment} orgId={organization?.id} currentUserId={user?.id} />
                        )}
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
                    onInsightReady={(result) => {
                      setCachedInsight(result);
                      if (orgId) {
                        saveDMAInsight(orgId, result.strategicInsight, result.recommendedActions);
                        saveDMASuggestedTasks(orgId, result.recommendedActions, assessments);
                      }
                    }}
                    onQualityCheckReady={(assessmentId, check) => {
                      if (orgId) saveQualityCheck(assessmentId, orgId, check);
                    }}
                    onEditTopic={(topicCode, assessmentId, qualityCheck) => {
                      // Prefer the exact record that was analyzed (by ID); fall back to topic code match.
                      const match = assessments.find(a => a.id === assessmentId)
                        ?? assessments.find(a => String(a.topic).startsWith(topicCode));
                      setEditingAssessment(match ?? null);
                      setHubQualityCheck(qualityCheck ?? null);
                      setIsFormOpen(true);
                      setEditFromHub(true);
                      setView('assess');
                    }}
                  />
                )}

                {view === 'tasks' && (
                  <TaskManagement
                    orgId={organization.id}
                    assessments={assessments}
                    kpis={kpis}
                    swotData={swot.data}
                    profile={profile.data}
                    cachedInsight={cachedInsight}
                    members={members}
                    currentUserId={user.id}
                    targetTaskId={targetTaskId}
                    isSidebarCollapsed={isSidebarCollapsed}
                    onNavigateToInsightHub={() => setView('insight_hub')}
                    onNavigateToDMARecord={(topicCode) => {
                      const match = assessments.find(a => String(a.topic).startsWith(topicCode ?? ''));
                      setEditingAssessment(match ?? null);
                      setEditFromHub(false);
                      setIsFormOpen(!!match);
                      setView('assess');
                    }}
                    onNavigateToKPI={(kpiIdOrName) => {
                      setTargetKpiId(kpiIdOrName);
                      setView('kpi');
                    }}
                  />
                )}

                {view === 'carbon_wizard' && (
                  <CarbonWizard
                    orgId={organization.id}
                    currentUserId={user.id}
                    profile={profile.data}
                    bmcData={canvas.data}
                    onComplete={() => setView('carbon_dashboard')}
                    onSkip={() => setView('carbon_dashboard')}
                  />
                )}

                {view === 'carbon_dashboard' && (
                  <CarbonDashboard
                    orgId={organization.id}
                    currentUserId={user.id}
                    onRunWizard={() => setView('carbon_wizard')}
                  />
                )}

                {view === 'settings' && (
                  <SettingsDashboard
                    organizationId={organization.id}
                    currentUserId={user.id}
                    currentUserRole={currentUserRole}
                    members={members}
                    onMembersChanged={refetchOrg}
                  />
                )}

                {view === 'user_profile' && (
                  <UserProfilePage
                    userId={user.id}
                    userEmail={user.email ?? ''}
                  />
                )}
              </>
            )}
          </div>
        </main>
      </div>
      <AllyAssistant 
        userEmail={user?.email} 
        companyName={profile.data.name} 
        userRole={currentUserRole || undefined} 
        userId={user?.id}
        orgId={organization?.id}
      />
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

const NavSection = ({ label, open, onToggle, sidebarCollapsed, children }: {
  label: string; open: boolean; onToggle: () => void; sidebarCollapsed: boolean; children: React.ReactNode;
}) => (
  <div className="space-y-1">
    {sidebarCollapsed
      ? <div className="h-px bg-slate-800 my-2 mx-2" />
      : (
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between px-4 py-1 text-xs font-bold text-slate-500 uppercase tracking-wider hover:text-slate-300 transition-colors"
        >
          {label}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
        </button>
      )
    }
    {(sidebarCollapsed || open) && <div className="space-y-1">{children}</div>}
  </div>
);

const StatCard = ({ title, value, icon, description }: { title: string, value: string, icon: React.ReactNode, description?: string }) => (
  <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center gap-4 transition-colors">
    <div className="w-12 h-12 bg-slate-50 dark:bg-slate-900 rounded-full flex items-center justify-center border border-slate-100 dark:border-slate-700 flex-shrink-0">{icon}</div>
    <div className="min-w-0">
      <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{title}</p>
      <p className="text-2xl font-bold text-slate-800 dark:text-white">{value}</p>
      {description && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 leading-relaxed">{description}</p>}
    </div>
  </div>
);

export default App;
