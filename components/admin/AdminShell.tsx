import React, { useState } from 'react';
import {
  ShieldCheck, LayoutDashboard, Building2, Zap, Users,
  LogOut, ChevronRight, Menu, X, Factory
} from 'lucide-react';
import AdminDashboard from './AdminDashboard';
import AdminUsersPanel from './AdminUsersPanel';
import CompanyListPanel from './CompanyListPanel';
import AdminAIUsagePanel from './AdminAIUsagePanel';
import AdminEmissionFactorsPanel from './AdminEmissionFactorsPanel';

type AdminView = 'dashboard' | 'companies' | 'emission_factors' | 'ai_usage' | 'admins';

interface Props {
  adminToken: string;
  adminEmail: string;
  onSignOut: () => void;
}

const AdminShell: React.FC<Props> = ({ adminToken, adminEmail, onSignOut }) => {
  const [view, setView]             = useState<AdminView>('dashboard');
  const [mobileSidebarOpen, setMob] = useState(false);

  const NAV: { id: AdminView; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: 'dashboard',  label: 'Dashboard',       icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: 'companies',  label: 'Companies',        icon: <Building2 className="w-5 h-5" /> },
    { id: 'emission_factors', label: 'Emission Factors', icon: <Factory className="w-5 h-5" /> },
    { id: 'ai_usage',   label: 'AI Usage',         icon: <Zap className="w-5 h-5" /> },
    { id: 'admins',     label: 'Admin Users',      icon: <Users className="w-5 h-5" /> },
  ];

  const VIEW_LABELS: Record<AdminView, string> = {
    dashboard: 'Platform Overview',
    companies: 'Company Management',
    emission_factors: 'Emission Factors',
    ai_usage:  'AI Usage',
    admins:    'Admin Users',
  };

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="p-5 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-esg-700 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <p className="text-white font-bold text-sm leading-tight">AeternumAlly</p>
              <span className="text-slate-400 text-[10px] font-semibold">v 1.1.0</span>
            </div>
            <p className="text-slate-500 text-xs leading-tight">Admin Portal</p>
          </div>
        </div>
        <button onClick={() => setMob(false)} className="lg:hidden text-slate-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV.map(item => (
          <button
            key={item.id}
            onClick={() => { setView(item.id); setMob(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              view === item.id
                ? 'bg-esg-600 text-white shadow-md shadow-esg-600/20'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <span>{item.icon}</span>
            <span className="flex-1 text-left">{item.label}</span>
            {item.badge && (
              <span className="text-[10px] font-semibold bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded-full">
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* User + sign out */}
      <div className="p-3 border-t border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-7 h-7 rounded-full bg-esg-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {adminEmail.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">{adminEmail}</p>
            <p className="text-xs text-slate-500">Platform Admin</p>
          </div>
          <button
            onClick={onSignOut}
            title="Sign out"
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="h-screen overflow-hidden flex bg-slate-100 dark:bg-slate-900">
      {/* Mobile overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMob(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 bottom-0 left-0 z-50 w-60 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800
        transition-transform duration-300
        ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:h-screen
      `}>
        <SidebarContent />
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0 lg:ml-0 overflow-hidden">
        {/* Header */}
        <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 h-14 flex items-center justify-between px-4 md:px-6 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMob(true)}
              className="lg:hidden p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-400 dark:text-slate-500 hidden sm:inline">Admin</span>
              <ChevronRight className="w-3.5 h-3.5 hidden sm:block" />
              <span className="font-medium text-slate-800 dark:text-white">{VIEW_LABELS[view]}</span>
            </div>
          </div>
          <a
            href="/"
            className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors hidden sm:inline"
          >
            ← Back to Tenant App
          </a>
        </header>

        {/* Content */}
        <div className="flex-1 p-4 md:p-8 overflow-auto">
          {view === 'dashboard' && <AdminDashboard adminToken={adminToken} />}
          {view === 'companies' && <CompanyListPanel adminToken={adminToken} />}
          {view === 'emission_factors' && <AdminEmissionFactorsPanel adminToken={adminToken} />}
          {view === 'admins'    && <AdminUsersPanel adminToken={adminToken} adminEmail={adminEmail} />}
          {view === 'ai_usage'  && <AdminAIUsagePanel adminToken={adminToken} />}
        </div>
      </main>
    </div>
  );
};

export default AdminShell;
