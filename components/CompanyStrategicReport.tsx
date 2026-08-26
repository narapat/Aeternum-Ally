import React, { useMemo, useState } from 'react';
import { AlertCircle, Brain, Download, FileText, Loader2, RefreshCw } from 'lucide-react';
import { CompanyProfile, CompanyStrategicReport as CompanyStrategicReportData, SustainabilityBusinessModel, SwotAnalysis } from '../types';
import { generateCompanyStrategicReport } from '../services/geminiService';
import { logError } from '../services/errorLogService';

interface Props {
  profile: CompanyProfile;
  bmcData: SustainabilityBusinessModel;
  swotData: SwotAnalysis;
  organizationId: string;
}

const canvasLabels: { key: keyof SustainabilityBusinessModel; label: string }[] = [
  { key: 'valueProposition', label: 'Value Propositions' },
  { key: 'customerSegments', label: 'Customer Segments' },
  { key: 'channels', label: 'Channels' },
  { key: 'customerRelationships', label: 'Customer Relationships' },
  { key: 'keyActivities', label: 'Key Activities' },
  { key: 'keyResources', label: 'Key Resources' },
  { key: 'keyPartners', label: 'Key Partners' },
  { key: 'revenueStreams', label: 'Revenue Streams' },
  { key: 'costStructure', label: 'Cost Structure' },
  { key: 'ecoSocialCosts', label: 'Eco-Social Costs' },
  { key: 'ecoSocialBenefits', label: 'Eco-Social Benefits' },
];

const swotLabels: { key: keyof SwotAnalysis; label: string }[] = [
  { key: 'strengths', label: 'Strengths' },
  { key: 'weaknesses', label: 'Weaknesses' },
  { key: 'opportunities', label: 'Opportunities' },
  { key: 'threats', label: 'Threats' },
];

const hasItems = (items: string[]) => items.some(item => item.trim().length > 0);

const CompanyStrategicReport: React.FC<Props> = ({ profile, bmcData, swotData, organizationId }) => {
  const [report, setReport] = useState<CompanyStrategicReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const completeness = useMemo(() => {
    const profileFields = [
      profile.name,
      profile.industry,
      profile.description,
      profile.mission,
      profile.vision,
      profile.productsServices,
    ].filter(value => value.trim().length > 0).length;
    const bmcBlocks = canvasLabels.filter(({ key }) => hasItems(bmcData[key])).length;
    const swotBlocks = swotLabels.filter(({ key }) => hasItems(swotData[key])).length;
    return { profileFields, bmcBlocks, swotBlocks };
  }, [profile, bmcData, swotData]);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const generated = await generateCompanyStrategicReport(profile, bmcData, swotData);
      setReport(generated);
    } catch (e: any) {
      const msg = e?.message ?? 'Failed to generate company report.';
      setError(msg);
      logError({
        context: 'company-strategic-report',
        action: 'generate_report',
        error: e,
        organizationId,
        metadata: {
          profile_fields: completeness.profileFields,
          bmc_blocks: completeness.bmcBlocks,
          swot_blocks: completeness.swotBlocks,
        },
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-500">
      {error && (
        <div className="flex items-start gap-2 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300 print:hidden">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold mb-1">Couldn't generate company report</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Company Strategic Profile Report</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Company Profile, SBMC, and SWOT synthesis
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="flex items-center justify-center gap-2 bg-esg-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-esg-700 shadow-lg shadow-esg-600/20 transition-all w-full sm:w-auto disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {report ? (loading ? 'Regenerating...' : 'Regenerate') : (loading ? 'Generating...' : 'Generate Report')}
          </button>
          {report && (
            <button
              onClick={() => window.print()}
              className="flex items-center justify-center gap-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-5 py-2.5 rounded-lg font-medium hover:bg-slate-800 dark:hover:bg-slate-100 shadow-lg transition-all w-full sm:w-auto"
            >
              <Download className="w-4 h-4" />
              Export PDF
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:hidden">
        <Metric label="Profile inputs" value={`${completeness.profileFields}/6`} />
        <Metric label="SBMC blocks populated" value={`${completeness.bmcBlocks}/11`} />
        <Metric label="SWOT blocks populated" value={`${completeness.swotBlocks}/4`} />
      </div>

      <div className="bg-white text-slate-900 shadow-xl rounded-xl overflow-hidden print:shadow-none print:rounded-none min-h-[900px]">
        <div className="bg-slate-900 text-white p-8 md:p-12 print:bg-white print:text-black print:border-b-2 print:border-black">
          <div className="flex justify-between items-start gap-6">
            <div>
              <div className="uppercase tracking-widest text-xs font-bold text-slate-400 mb-4">Company Strategic Profile</div>
              <h1 className="text-3xl md:text-5xl font-serif font-bold mb-4">{profile.name || 'Company Report'}</h1>
              <p className="text-lg opacity-80 max-w-2xl">{profile.description || 'Generated from Company Profile, SBMC, and SWOT inputs.'}</p>
            </div>
            <div className="hidden md:block opacity-50">
              <FileText className="w-16 h-16" />
            </div>
          </div>
          <div className="mt-8 flex flex-wrap gap-4 text-sm">
            {profile.industry && <span className="px-3 py-1 bg-white/10 rounded border border-white/20">{profile.industry}</span>}
            {profile.employeeCount && <span className="px-3 py-1 bg-white/10 rounded border border-white/20">Employees: {profile.employeeCount}</span>}
            {profile.revenueRange && <span className="px-3 py-1 bg-white/10 rounded border border-white/20">Revenue: {profile.revenueRange}</span>}
          </div>
        </div>

        <div className="p-8 md:p-12 max-w-5xl mx-auto w-full space-y-12">
          <section className="bg-slate-50 p-6 rounded-lg border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Report Basis</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-700">
              <p><span className="font-semibold">Report type:</span> Company Strategic Profile</p>
              <p><span className="font-semibold">Generated date:</span> {new Date().toLocaleDateString()}</p>
              <p><span className="font-semibold">Data basis:</span> Company Profile, SBMC, SWOT</p>
              <p><span className="font-semibold">Status:</span> Draft for internal review</p>
            </div>
          </section>

          {report ? (
            <>
              <ReportSection number="1" title="Company Profile Summary" icon={<Brain className="w-5 h-5" />}>
                {report.profileSummary}
              </ReportSection>
              <ReportSection number="2" title="Sustainable Business Model Analysis">
                {report.businessModelSummary}
              </ReportSection>
              <ReportSection number="3" title="SWOT Strategic Analysis">
                {report.swotAnalysis}
              </ReportSection>
              <ReportSection number="4" title="Strategic Commentary">
                {report.strategicCommentary}
              </ReportSection>

              <ListSection title="Data Gaps" items={report.dataGaps} />
              <ListSection title="Recommended Next Steps" items={report.recommendations} />
            </>
          ) : (
            <div className="space-y-10">
              <PreviewSection profile={profile} bmcData={bmcData} swotData={swotData} />
            </div>
          )}

          <div className="mt-16 pt-8 border-t border-slate-200 text-center text-xs text-slate-400">
            <p>This company strategic profile is generated by Aeternum Ally SaaS.</p>
            <p className="mt-1">Review internally before using externally.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
    <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
  </div>
);

const ReportSection: React.FC<{ number: string; title: string; icon?: React.ReactNode; children: string }> = ({ number, title, icon, children }) => (
  <section className="break-inside-avoid">
    <div className="flex items-center gap-3 mb-4 border-b border-slate-200 pb-2">
      <div className="w-8 h-8 bg-slate-900 text-white flex items-center justify-center font-bold text-sm rounded">{number}</div>
      <h2 className="text-xl font-bold uppercase tracking-wide flex items-center gap-2">
        {icon}
        {title}
      </h2>
    </div>
    <p className="text-slate-700 text-sm md:text-base leading-relaxed text-justify whitespace-pre-wrap">{children}</p>
  </section>
);

const ListSection: React.FC<{ title: string; items: string[] }> = ({ title, items }) => (
  <section className="break-inside-avoid">
    <h3 className="text-lg font-bold text-slate-900 mb-3">{title}</h3>
    {items.length ? (
      <ul className="list-disc pl-5 space-y-2 text-sm md:text-base text-slate-700">
        {items.map((item, idx) => <li key={idx}>{item}</li>)}
      </ul>
    ) : (
      <p className="text-sm text-slate-400 italic">No items generated.</p>
    )}
  </section>
);

const PreviewSection: React.FC<{ profile: CompanyProfile; bmcData: SustainabilityBusinessModel; swotData: SwotAnalysis }> = ({ profile, bmcData, swotData }) => (
  <section className="space-y-8">
    <div>
      <h3 className="text-lg font-bold text-slate-900 mb-4">Current Company Inputs</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-700">
        <p><span className="font-semibold">Company:</span> {profile.name || 'Not provided'}</p>
        <p><span className="font-semibold">Industry:</span> {profile.industry || 'Not provided'}</p>
        <p><span className="font-semibold">Products / Services:</span> {profile.productsServices || 'Not provided'}</p>
        <p><span className="font-semibold">Mission:</span> {profile.mission || 'Not provided'}</p>
      </div>
    </div>

    <div>
      <h3 className="text-lg font-bold text-slate-900 mb-4">SBMC Snapshot</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {canvasLabels.map(({ key, label }) => (
          <SnapshotList key={key} label={label} items={bmcData[key]} />
        ))}
      </div>
    </div>

    <div>
      <h3 className="text-lg font-bold text-slate-900 mb-4">SWOT Snapshot</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {swotLabels.map(({ key, label }) => (
          <SnapshotList key={key} label={label} items={swotData[key]} />
        ))}
      </div>
    </div>
  </section>
);

const SnapshotList: React.FC<{ label: string; items: string[] }> = ({ label, items }) => (
  <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
    <h4 className="font-bold text-slate-900 text-sm mb-2">{label}</h4>
    {hasItems(items) ? (
      <ul className="list-disc pl-4 space-y-1 text-sm text-slate-600">
        {items.slice(0, 6).map((item, idx) => <li key={idx}>{item}</li>)}
      </ul>
    ) : (
      <p className="text-sm text-slate-400 italic">Not provided</p>
    )}
  </div>
);

export default CompanyStrategicReport;
