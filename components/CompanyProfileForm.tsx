
import React, { useState } from 'react';
import { CompanyProfile } from '../types';
import { INDUSTRY_SECTORS, ISIC_CODES_GROUPED, COUNTRIES } from '../constants';
import {
  Building2, MapPin, Globe, Hash, Users, Wallet, Target, Layers, BookOpen,
  Settings, Mail, Phone, AlertCircle, ArrowRight,
} from 'lucide-react';
import SaveIndicator from './SaveIndicator';
import type { SaveStatus } from '../hooks/useOrgData';

interface Props {
  data: CompanyProfile;
  onChange: (data: CompanyProfile) => void;
  onSave: () => void;
  saveStatus: SaveStatus;
  isDirty: boolean;
  saveError?: string | null;
  /** Called when user clicks the "Go to Settings" link */
  onOpenSettings?: () => void;
}

const CompanyProfileForm: React.FC<Props> = ({
  data, onChange, onSave, saveStatus, isDirty, saveError, onOpenSettings,
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'details' | 'strategy'>('general');
  const [emailError, setEmailError] = useState<string | null>(null);

  const handleChange = (field: keyof CompanyProfile, value: string) => {
    onChange({ ...data, [field]: value });
  };

  const handleEmailChange = (value: string) => {
    handleChange('contactEmail', value);
    if (emailError && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) setEmailError(null);
  };

  const handleEmailBlur = (value: string) => {
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setEmailError('Please enter a valid email address.');
    } else {
      setEmailError(null);
    }
  };

  return (
    <div className="w-full animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start mb-8 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Company Profile</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Manage your official business entity data. This information powers the AI context for your reports.
          </p>
        </div>
        <SaveIndicator status={saveStatus} isDirty={isDirty} onSave={onSave} errorMessage={saveError} />
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
          <TabButton
            active={activeTab === 'general'} onClick={() => setActiveTab('general')}
            icon={<Building2 className="w-4 h-4 flex-shrink-0" />} label="General Information" />
          <TabButton
            active={activeTab === 'details'} onClick={() => setActiveTab('details')}
            icon={<Hash className="w-4 h-4 flex-shrink-0" />} label="Business Details" />
          <TabButton
            active={activeTab === 'strategy'} onClick={() => setActiveTab('strategy')}
            icon={<Target className="w-4 h-4 flex-shrink-0" />} label="Strategy & Mission" />
          {/* Team & AI moved to Settings */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex items-center gap-2 px-4 py-4 text-sm font-medium text-slate-400 dark:text-slate-500 hover:text-esg-600 dark:hover:text-esg-400 border-b-2 border-transparent whitespace-nowrap transition-colors ml-auto"
          >
            <Settings className="w-4 h-4 flex-shrink-0" /> Team &amp; AI
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-4 md:p-8">
          {activeTab === 'general' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <InputField label="Company Name (Registered)" value={data.name} onChange={(v) => handleChange('name', v)} placeholder="e.g. EcoTech Solutions Ltd." fullWidth />
              <InputField label="Registration No. / Tax ID" value={data.taxId} onChange={(v) => handleChange('taxId', v)} placeholder="e.g. 01055640XXXXX" icon={<Hash className="w-4 h-4 text-slate-400" />} />
              <InputField label="Founding Year" value={data.foundingYear} onChange={(v) => handleChange('foundingYear', v)} placeholder="e.g. 2018" type="number" />

              {/* ── Registered Address ── */}
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-slate-400" /> Registered Address
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Street Address</label>
                    <input className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-esg-500 text-sm"
                      value={data.addressStreet} onChange={(e) => handleChange('addressStreet', e.target.value)} placeholder="e.g. 555 Green Park Road" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">City</label>
                    <input className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-esg-500 text-sm"
                      value={data.addressCity} onChange={(e) => handleChange('addressCity', e.target.value)} placeholder="e.g. Bangkok" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">State / Province</label>
                    <input className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-esg-500 text-sm"
                      value={data.addressState} onChange={(e) => handleChange('addressState', e.target.value)} placeholder="e.g. Bangkok" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Postal Code</label>
                    <input className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-esg-500 text-sm"
                      value={data.addressPostalCode} onChange={(e) => handleChange('addressPostalCode', e.target.value)} placeholder="e.g. 10140" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Country</label>
                    <select className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-esg-500 text-sm"
                      value={data.addressCountry} onChange={(e) => handleChange('addressCountry', e.target.value)}>
                      <option value="">— Select country —</option>
                      {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <InputField label="Website URL" value={data.website} onChange={(v) => handleChange('website', v)} placeholder="https://..." icon={<Globe className="w-4 h-4 text-slate-400" />} fullWidth />

              {/* ── Contact ── */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Contact Email</label>
                <div className="relative">
                  <Mail className="absolute top-3 left-3 w-4 h-4 text-slate-400" />
                  <input type="email"
                    className={`w-full pl-10 p-2.5 border rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-esg-500 ${emailError ? 'border-red-400 dark:border-red-500' : 'border-slate-300 dark:border-slate-600'}`}
                    value={data.contactEmail}
                    onChange={(e) => handleEmailChange(e.target.value)}
                    onBlur={(e) => handleEmailBlur(e.target.value)}
                    placeholder="e.g. contact@company.com" />
                </div>
                {emailError && <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{emailError}</p>}
              </div>
              <InputField label="Contact Phone" value={data.contactPhone} onChange={(v) => handleChange('contactPhone', v)} placeholder="e.g. +66 2 123 4567" icon={<Phone className="w-4 h-4 text-slate-400" />} />
            </div>
          )}

          {activeTab === 'details' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Industry Sector</label>
                <div className="relative">
                  <Layers className="absolute top-3 left-3 w-4 h-4 text-slate-400" />
                  <select value={data.industry} onChange={(e) => handleChange('industry', e.target.value)} className="w-full pl-10 p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-esg-500">
                    <option value="">Select Industry Sector</option>
                    {INDUSTRY_SECTORS.map((sector) => <option key={sector} value={sector}>{sector}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">ISIC Code</label>
                <div className="relative">
                  <BookOpen className="absolute top-3 left-3 w-4 h-4 text-slate-400" />
                  <select value={data.isicCode} onChange={(e) => handleChange('isicCode', e.target.value)} className="w-full pl-10 p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-esg-500">
                    <option value="">Select ISIC Code</option>
                    {ISIC_CODES_GROUPED.map((group) => (
                      <optgroup key={group.category} label={group.category}>
                        {group.codes.map((item) => <option key={item.code} value={`${item.code} - ${item.label}`}>{item.code} - {item.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Number of Employees</label>
                <div className="relative">
                  <Users className="absolute top-3 left-3 w-4 h-4 text-slate-400" />
                  <select value={data.employeeCount} onChange={(e) => handleChange('employeeCount', e.target.value)} className="w-full pl-10 p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-esg-500">
                    <option value="">Select Range</option>
                    <option value="1-5">1-5 (Micro)</option>
                    <option value="6-50">6-50 (Small)</option>
                    <option value="51-200">51-200 (Medium)</option>
                    <option value="201+">201+ (Large)</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Annual Revenue</label>
                <div className="relative">
                  <Wallet className="absolute top-3 left-3 w-4 h-4 text-slate-400" />
                  <select value={data.revenueRange} onChange={(e) => handleChange('revenueRange', e.target.value)} className="w-full pl-10 p-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-esg-500">
                    <option value="">Select Revenue Range</option>
                    <option value="< 1.8 MB">&lt; 1.8 Million THB</option>
                    <option value="1.8 MB - 50 MB">1.8 MB - 50 Million THB</option>
                    <option value="50 MB - 300 MB">50 MB - 300 Million THB</option>
                    <option value="> 300 MB">&gt; 300 Million THB</option>
                  </select>
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Primary Products / Services</label>
                <input className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-esg-500" value={data.productsServices} onChange={(e) => handleChange('productsServices', e.target.value)} placeholder="e.g. Biodegradable bowls, Custom pulp molding, Consulting" />
                <p className="text-xs text-slate-500 mt-1">Separate with commas</p>
              </div>
            </div>
          )}

          {activeTab === 'strategy' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">Business Description</label>
                <textarea className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-esg-500 h-32 resize-none" value={data.description} onChange={(e) => handleChange('description', e.target.value)} placeholder="Provide a comprehensive overview of what your company does..." />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-blue-700 dark:text-blue-400">Mission Statement</label>
                  <textarea className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 h-32 resize-none" value={data.mission} onChange={(e) => handleChange('mission', e.target.value)} placeholder="What is your core purpose? (e.g. To reduce plastic waste...)" />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-emerald-700 dark:text-emerald-400">Vision Statement</label>
                  <textarea className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 h-32 resize-none" value={data.vision} onChange={(e) => handleChange('vision', e.target.value)} placeholder="Where do you want to be in the future?" />
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

const TabButton = ({ active, onClick, icon, label }: any) => (
  <button
    onClick={onClick}
    className={`flex-1 min-w-[160px] py-4 flex items-center justify-center gap-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
      active
      ? 'border-esg-600 text-esg-700 dark:text-esg-400 dark:border-esg-400 bg-slate-50 dark:bg-slate-700/50'
      : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
    }`}
  >
    {icon}
    {label}
  </button>
);

const InputField = ({ label, value, onChange, placeholder, icon, type = 'text', fullWidth }: any) => (
  <div className={fullWidth ? 'md:col-span-2' : ''}>
    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">{label}</label>
    <div className="relative">
      {icon && <div className="absolute top-3 left-3">{icon}</div>}
      <input
        type={type}
        className={`w-full border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-esg-500 p-2.5 ${icon ? 'pl-10' : 'pl-3'}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  </div>
);

export default CompanyProfileForm;
