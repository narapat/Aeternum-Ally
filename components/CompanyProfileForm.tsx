
import React, { useState } from 'react';
import {
  CompanyProfile,
  CompanyContextCategory,
  CompanyContextItem,
  CompanyContextStatus,
} from '../types';
import { INDUSTRY_SECTORS, ISIC_CODES_GROUPED, COUNTRIES } from '../constants';
import {
  Building2, MapPin, Globe, Hash, Users, Wallet, Target, Layers, BookOpen,
  Settings, Mail, Phone, AlertCircle, ArrowRight, Workflow, Plus, X,
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
  const [activeTab, setActiveTab] = useState<'general' | 'details' | 'strategy' | 'context'>('general');
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
          <TabButton
            active={activeTab === 'context'} onClick={() => setActiveTab('context')}
            icon={<Workflow className="w-4 h-4 flex-shrink-0" />} label="How We Work" />
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

          {activeTab === 'context' && (
            <div>
              <div className="mb-2">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">How your business works</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Answer whatever you can — all of this is optional, and you can come back later.
                  AeternumAlly only uses what you state here as fact, so leaving something out is
                  better than guessing. Mark anything you are only considering as Planned or Exploring
                  and it will not be treated as something you already do.
                </p>
              </div>

              {CONTEXT_GROUPS.map(group => (
                <ContextGroup
                  key={group.category}
                  group={group}
                  items={data.structuredContext ?? []}
                  onChange={items => onChange({ ...data, structuredContext: items })}
                />
              ))}
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

/**
 * The questions a user actually sees. The internal category never appears —
 * "commercial model" and "ecosystem relationships" are our words, not theirs.
 */
const CONTEXT_GROUPS: {
  category: CompanyContextCategory;
  question: string;
  helper: string;
  namePlaceholder: string;
  rolePlaceholder: string;
}[] = [
  {
    category: 'business',
    question: 'What kind of business is this, and who are your main customers?',
    helper: 'For example: a subscription software product, sold to small manufacturers.',
    namePlaceholder: 'e.g. Small manufacturers',
    rolePlaceholder: 'e.g. Main customer group',
  },
  {
    category: 'operating',
    question: 'What work does your company need to do well to deliver what it sells?',
    helper: 'Only what you actually do today. If you do not have something yet, mark it "Not established".',
    namePlaceholder: 'e.g. Software development',
    rolePlaceholder: 'e.g. Done in-house',
  },
  {
    category: 'technology',
    question: 'Which tools, platforms, or services does your business run on?',
    helper: 'Say what each one is used for — running the product, building it, or internal work.',
    namePlaceholder: 'e.g. Netlify',
    rolePlaceholder: 'e.g. Application hosting',
  },
  {
    category: 'commercial',
    question: 'How do customers pay you, and how do you reach them?',
    helper: 'For example: monthly subscription; introductions from existing customers.',
    namePlaceholder: 'e.g. Monthly subscription',
    rolePlaceholder: 'e.g. How customers pay',
  },
  {
    category: 'ecosystem',
    question: 'Which outside organizations does your business depend on or work with?',
    helper: 'Suppliers, resellers, consultants, or anyone you rely on. Not standards you follow — those go below.',
    namePlaceholder: 'e.g. Sustainability consultants',
    rolePlaceholder: 'e.g. Refer clients to us',
  },
  {
    category: 'standards',
    question: 'Which sustainability standards or frameworks do you use or follow?',
    helper: 'Using a standard does not make its organization a partner — this is kept separate on purpose.',
    namePlaceholder: 'e.g. GHG Protocol',
    rolePlaceholder: 'e.g. Methodology we follow',
  },
];

const STATUS_CHOICES: { value: CompanyContextStatus; label: string }[] = [
  { value: 'current', label: 'Now' },
  { value: 'planned', label: 'Planned' },
  { value: 'exploring', label: 'Exploring' },
  { value: 'not_established', label: 'Not yet' },
];

const ContextGroup: React.FC<{
  group: typeof CONTEXT_GROUPS[number];
  items: CompanyContextItem[];
  onChange: (items: CompanyContextItem[]) => void;
}> = ({ group, items, onChange }) => {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  // Chosen before the item exists. Creating everything as 'current' and asking
  // the user to correct it afterwards records a plan as a present fact for as
  // long as they do not notice — the failure this whole layer exists to stop.
  const [status, setStatus] = useState<CompanyContextStatus>('current');

  const mine = items.filter(i => i.category === group.category);
  const others = items.filter(i => i.category !== group.category);

  const add = () => {
    if (!name.trim()) return;
    onChange([...others, ...mine, {
      id: crypto.randomUUID(),
      category: group.category,
      name: name.trim(),
      role: role.trim(),
      status,
      source: 'user',
      updatedAt: new Date().toISOString(),
    }]);
    setName('');
    setRole('');
    setStatus('current');
  };

  const update = (id: string, patch: Partial<CompanyContextItem>) =>
    onChange([...others, ...mine.map(i =>
      i.id === id ? { ...i, ...patch, updatedAt: new Date().toISOString() } : i)]);

  const remove = (id: string) => onChange([...others, ...mine.filter(i => i.id !== id)]);

  return (
    <section className="py-5 border-b border-slate-100 dark:border-slate-700 last:border-0">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-white">{group.question}</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-3">{group.helper}</p>

      {mine.length > 0 && (
        <ul className="space-y-2 mb-3">
          {mine.map(item => (
            <li key={item.id} className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700">
              <span className="font-medium text-sm text-slate-800 dark:text-white">{item.name}</span>
              {item.role && <span className="text-xs text-slate-500 dark:text-slate-400">— {item.role}</span>}
              <div className="flex gap-1 ml-auto">
                {STATUS_CHOICES.map(choice => (
                  <button
                    key={choice.value}
                    onClick={() => update(item.id, { status: choice.value })}
                    className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                      item.status === choice.value
                        ? 'bg-esg-600 text-white'
                        : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600 hover:border-esg-400'
                    }`}
                  >
                    {choice.label}
                  </button>
                ))}
                <button
                  onClick={() => remove(item.id)}
                  aria-label={`Remove ${item.name}`}
                  className="p-1 text-slate-400 hover:text-red-500"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={group.namePlaceholder}
          className="flex-1 min-w-[160px] px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
        />
        <input
          value={role}
          onChange={e => setRole(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={group.rolePlaceholder}
          className="flex-1 min-w-[160px] px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
        />
        <div className="flex items-center gap-1" role="group" aria-label="Status for the item being added">
          {STATUS_CHOICES.map(choice => (
            <button
              key={choice.value}
              type="button"
              aria-pressed={status === choice.value}
              onClick={() => setStatus(choice.value)}
              className={`px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                status === choice.value
                  ? 'bg-esg-600 text-white'
                  : 'bg-white dark:bg-slate-950 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-600 hover:border-esg-400'
              }`}
            >
              {choice.label}
            </button>
          ))}
        </div>
        <button
          onClick={add}
          disabled={!name.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-esg-600 hover:bg-esg-700 disabled:opacity-40 text-white"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>
    </section>
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
