
import React, { useState, useEffect } from 'react';
import { CompanyProfile, AssessmentData, SustainabilityBusinessModel } from '../types';
import { GRI_MAPPING } from '../constants';
import { triggerReportGeneration, getReportStatus, GeneratedStatement } from '../services/geminiService';
import { logError } from '../services/errorLogService';
import { FileText, Download, Loader2, Book, RefreshCw, ShieldCheck, AlertCircle } from 'lucide-react';

interface Props {
  profile: CompanyProfile;
  assessments: AssessmentData[];
  canvas: SustainabilityBusinessModel;
  organizationId: string;
}

const SustainabilityStatement: React.FC<Props> = ({ profile, assessments, canvas, organizationId }) => {
  const [generatedContent, setGeneratedContent] = useState<GeneratedStatement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const materialTopics = React.useMemo(() => {
    const topicMap = new Map<string, AssessmentData>();
    
    assessments.filter(a => a.isMaterial).forEach(assessment => {
      const topicCode = assessment.topic.split(' ')[0];
      
      if (!topicMap.has(topicCode)) {
        topicMap.set(topicCode, assessment);
      } else {
        const existing = topicMap.get(topicCode)!;
        const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
        const newTime = assessment.updatedAt ? new Date(assessment.updatedAt).getTime() : 0;
        
        if (newTime > existingTime) {
          topicMap.set(topicCode, assessment);
        }
      }
    });
    
    return Array.from(topicMap.values());
  }, [assessments]);

  const [polling, setPolling] = useState(false);

  useEffect(() => {
    // Check initial status
    const checkStatus = async () => {
      const data = await getReportStatus();
      if (data) {
        if (data.status === 'completed' && data.result) {
          setGeneratedContent(data.result);
        } else if (data.status === 'processing') {
          setPolling(true);
          setLoading(true);
        } else if (data.status === 'failed') {
          setError(data.error || "Generation failed");
        }
      }
    };
    checkStatus();
  }, [organizationId]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (polling) {
      interval = setInterval(async () => {
        const data = await getReportStatus();
        if (data) {
          if (data.status === 'completed') {
            setGeneratedContent(data.result);
            setPolling(false);
            setLoading(false);
          } else if (data.status === 'failed') {
            setError(data.error || "Generation failed");
            setPolling(false);
            setLoading(false);
          }
        }
      }, 5000); // Poll every 5 seconds
    }
    return () => clearInterval(interval);
  }, [polling]);

  const handleGenerate = async () => {
    if (loading && !window.confirm("A report generation is already in progress. Do you want to stop waiting and start a new one?")) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await triggerReportGeneration(profile, materialTopics);
      setPolling(true);
    } catch (e: any) {
      const msg = e?.message ?? 'Failed to start report generation.';
      setError(msg);
      setLoading(false);
      logError({
        context: 'sustainability-statement',
        action: 'trigger_report',
        error: e,
        organizationId,
        metadata: { topic_count: materialTopics.length },
      });
    }
  };

  const validateAndExport = () => {
    if (!generatedContent) return;
    
    const BLOCKED_PATTERNS = [
      /AI Draft not generated/i,
      /This section would typically contain/i,
      /TODO/i,
      /TBD/i,
      /\[Insert/i,
      /\[Placeholder/i,
      /Lorem ipsum/i,
      /\bundefined\b/i,
      /\bnull\b/i,
      /\bNaN\b/i,
      /\{\{/,
      /\}\}/
    ];

    const fullText = [
      generatedContent.generalDisclosure,
      generatedContent.strategyDisclosure,
      ...generatedContent.topics.map(t => t.disclosureContent)
    ].join(" ");

    const hasIssue = BLOCKED_PATTERNS.some(pattern => pattern.test(fullText));

    if (hasIssue) {
      alert("This report cannot be exported yet because it contains unresolved draft or placeholder content. Please review the flagged sections before exporting.");
      return;
    }

    window.print();
  };

  if (materialTopics.length === 0) {
    return (
        <div className="flex flex-col items-center justify-center h-[500px] bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center animate-in fade-in duration-500">
            <div className="bg-slate-100 dark:bg-slate-700 p-4 rounded-full mb-4">
                <FileText className="w-12 h-12 text-slate-400" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Insufficient Data for Reporting</h3>
            <p className="text-slate-500 dark:text-slate-400 max-w-md">
                To generate a Sustainability Statement aligned with ESRS and GRI standards, you must first conduct Double Materiality Assessments and identify at least one material topic.
            </p>
        </div>
    );
  }

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-500">
      {error && (
        <div className="flex items-start gap-2 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300 print:hidden">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold mb-1">Couldn't generate report</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Baseline Sustainability Statement</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Generated from available sustainability data • FY {new Date().getFullYear()}
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          {!generatedContent ? (
            <div className="flex flex-col items-end gap-1 w-full sm:w-auto">
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="flex items-center justify-center gap-2 bg-esg-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-esg-700 shadow-lg shadow-esg-600/20 transition-all w-full sm:w-auto disabled:opacity-60"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {loading ? `Generating… (${materialTopics.length} topic${materialTopics.length !== 1 ? 's' : ''})` : 'Generate Report (AI)'}
              </button>
              {loading && (
                <p className="text-xs text-slate-400">This may take up to 30 seconds</p>
              )}
            </div>
          ) : (
            <div className="flex gap-2 w-full sm:w-auto">
              <button 
                  onClick={validateAndExport}
                  className="flex items-center justify-center gap-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-6 py-2.5 rounded-lg font-medium hover:bg-slate-800 dark:hover:bg-slate-100 shadow-lg transition-all w-full sm:w-auto"
              >
                  <Download className="w-4 h-4" />
                  Export to PDF
              </button>
              <button 
                  onClick={handleGenerate}
                  className="flex items-center justify-center gap-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-all w-full sm:w-auto disabled:opacity-60 text-sm"
              >
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  {loading ? 'Generating…' : 'Regenerate'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Document View */}
      <div className="bg-white text-slate-900 shadow-xl rounded-xl overflow-hidden print:shadow-none print:rounded-none min-h-[1000px] flex flex-col">
         
         {/* Cover Page Style Header */}
         <div className="bg-slate-900 text-white p-8 md:p-12 print:bg-white print:text-black print:border-b-2 print:border-black">
            <div className="flex justify-between items-start">
                <div>
                    <div className="uppercase tracking-widest text-xs font-bold text-slate-400 mb-4">Baseline Sustainability Statement {new Date().getFullYear()}</div>
                    <h1 className="text-3xl md:text-5xl font-serif font-bold mb-4">{profile.name}</h1>
                    <div className="text-lg opacity-80 max-w-2xl">{profile.description}</div>
                </div>
                <div className="hidden md:block opacity-50">
                    <ShieldCheck className="w-16 h-16" />
                </div>
            </div>
            <div className="mt-8 flex flex-wrap gap-4 text-sm">
                <span className="px-3 py-1 bg-white/10 rounded border border-white/20">Tax ID: {profile.taxId}</span>
                <span className="px-3 py-1 bg-white/10 rounded border border-white/20">{profile.industry}</span>
                <span className="px-3 py-1 bg-white/10 rounded border border-white/20">Employees: {profile.employeeCount}</span>
            </div>
         </div>

         {/* Content Body */}
         <div className="p-8 md:p-12 max-w-4xl mx-auto w-full space-y-12">
            
            {/* About this Statement (Status & Limitations) */}
            <section className="bg-slate-50 p-6 rounded-lg border border-slate-200 space-y-6">
                <div>
                    <h3 className="text-lg font-bold text-slate-900 mb-4">About this Statement</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                            <p><span className="font-semibold">Report status:</span> Draft Baseline</p>
                            <p><span className="font-semibold">Report type:</span> Baseline Sustainability Statement</p>
                            <p><span className="font-semibold">Reporting period:</span> FY{new Date().getFullYear()}</p>
                        </div>
                        <div>
                            <p><span className="font-semibold">Generated date:</span> {new Date().toLocaleDateString()}</p>
                            <p><span className="font-semibold">Reporting boundary:</span> Organization-level data only</p>
                            <p><span className="font-semibold">Assurance status:</span> Not externally assured</p>
                        </div>
                    </div>
                    <p className="text-sm text-slate-600 mt-4">
                        <span className="font-semibold">Data basis:</span> This statement was generated from available company profile, double materiality assessment, KPI, carbon tracking, and user-entered sustainability data.
                    </p>
                </div>

                <div className="border-t border-slate-200 pt-4">
                    <h4 className="font-bold text-slate-900 mb-2">Data Limitations and Reporting Boundaries</h4>
                    <p className="text-sm text-slate-600 text-justify">
                        This statement has been generated from the information currently available in the AeternumAlly platform. It represents a baseline view of the organization’s sustainability position for the reporting period.
                    </p>
                    <p className="text-sm text-slate-600 text-justify mt-2">
                        Historical year-on-year comparison is not yet available for all ESG indicators. Where quantitative data, policy documentation, implementation evidence, or historical records are incomplete, this statement identifies the limitation rather than assuming full availability.
                    </p>
                    <p className="text-sm text-slate-600 text-justify mt-2">
                        Unless otherwise stated, this statement has not been externally assured. It should be treated as a draft baseline document to support internal review, customer discussions, ESG readiness planning, and future sustainability reporting improvement.
                    </p>
                </div>
            </section>

            {/* Section 1: ESRS 2 General Disclosures */}
            <section>
                <div className="flex items-center gap-3 mb-6 border-b border-slate-200 pb-2">
                    <div className="w-8 h-8 bg-slate-900 text-white flex items-center justify-center font-bold text-sm rounded">1</div>
                    <h2 className="text-xl font-bold uppercase tracking-wide">General Disclosures (ESRS 2)</h2>
                </div>

                <div className="space-y-6">
                    <div className="prose max-w-none text-sm md:text-base text-justify text-slate-700">
                        <h4 className="font-bold text-slate-900 mb-2">Basis of Preparation</h4>
                        {generatedContent ? (
                            <p className="whitespace-pre-wrap">{generatedContent.generalDisclosure}</p>
                        ) : (
                            <p className="text-slate-400 italic">Click "Generate Report" to create the Basis of Preparation text based on your company profile and assessment methodology.</p>
                        )}
                    </div>

                    <div className="prose max-w-none text-sm md:text-base text-justify text-slate-700">
                        <h4 className="font-bold text-slate-900 mb-2">Strategy & Business Model (SBM-3)</h4>
                        {generatedContent ? (
                            <p className="whitespace-pre-wrap">{generatedContent.strategyDisclosure}</p>
                        ) : (
                            <div>
                                <p className="mb-2">The undertaking's business model creates value through:</p>
                                <ul className="list-disc pl-5 space-y-1 bg-slate-50 p-4 rounded-lg border border-slate-200">
                                    <li><strong className="text-slate-900">Value Proposition:</strong> {canvas.valueProposition}</li>
                                    <li><strong className="text-slate-900">Key Activities:</strong> {canvas.keyActivities}</li>
                                    <li><strong className="text-slate-900">Revenue Streams:</strong> {canvas.revenueStreams}</li>
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* Section 2: Double Materiality Assessment */}
            <section className="break-before-page">
                 <div className="flex items-center gap-3 mb-6 border-b border-slate-200 pb-2">
                    <div className="w-8 h-8 bg-slate-900 text-white flex items-center justify-center font-bold text-sm rounded">2</div>
                    <h2 className="text-xl font-bold uppercase tracking-wide">Material Impacts, Risks & Opportunities (IRO-1)</h2>
                </div>
                
                <p className="text-slate-700 mb-6 text-justify">
                    The undertaking has performed a double materiality assessment considering both impact materiality (inside-out) and financial materiality (outside-in). The following topics have been assessed as material:
                </p>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="bg-slate-100 border-b-2 border-slate-300 text-left">
                                <th className="p-3 font-bold text-slate-900">ESRS Topic</th>
                                <th className="p-3 font-bold text-slate-900">Impact Materiality (Inside-Out)</th>
                                <th className="p-3 font-bold text-slate-900">Financial Materiality (Outside-In)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {materialTopics.map(topic => (
                                <tr key={topic.id} className="border-b border-slate-200 break-inside-avoid">
                                    <td className="p-3 font-bold align-top w-1/4">{topic.topic}</td>
                                    <td className="p-3 align-top text-slate-700 w-1/3">
                                        {topic.impactDescription}
                                    </td>
                                    <td className="p-3 align-top text-slate-700 w-1/3">
                                        {topic.financialDescription}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Section 3: Topical Disclosures */}
            <section>
                 <div className="flex items-center gap-3 mb-6 border-b border-slate-200 pb-2">
                    <div className="w-8 h-8 bg-slate-900 text-white flex items-center justify-center font-bold text-sm rounded">3</div>
                    <h2 className="text-xl font-bold uppercase tracking-wide">Topical Disclosures (Policies & Actions)</h2>
                </div>

                <div className="space-y-8">
                    {materialTopics.map((topic, idx) => {
                         const generatedText = generatedContent?.topics.find(t => t.topicId === topic.topic.split(' ')[0])?.disclosureContent;
                         
                         return (
                            <div key={topic.id} className="break-inside-avoid">
                                <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                                    <Book className="w-5 h-5 text-slate-500" /> {topic.topic}
                                </h3>
                                <div className="bg-slate-50 p-6 rounded-lg border border-slate-200 text-justify text-slate-700 text-sm md:text-base leading-relaxed">
                                    {generatedText ? (
                                        <div className="whitespace-pre-wrap">{generatedText}</div>
                                    ) : (
                                        <div className="flex flex-col gap-4">
                                            <p className="italic text-slate-400">AI Draft not generated. This section would typically contain:</p>
                                            <ul className="list-disc pl-5 space-y-2 text-slate-500">
                                                <li><strong>Disclosure Requirement {topic.topic.split(' ')[0]}-1:</strong> Policies adopted to manage {topic.topic}.</li>
                                                <li><strong>Disclosure Requirement {topic.topic.split(' ')[0]}-2:</strong> Actions and resources related to {topic.topic}.</li>
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            </div>
                         )
                    })}
                </div>
            </section>

             {/* Section 4: GRI Interoperability Index */}
             <section className="break-inside-avoid">
                 <div className="flex items-center gap-3 mb-6 border-b border-slate-200 pb-2">
                    <div className="w-8 h-8 bg-esg-700 text-white flex items-center justify-center font-bold text-sm rounded">4</div>
                    <h2 className="text-xl font-bold uppercase tracking-wide text-esg-800">GRI Content Index</h2>
                </div>
                
                <div className="bg-slate-50 p-4 rounded-lg mb-4 text-sm text-slate-600">
                    <p className="mb-2">
                        <strong>Interoperability Statement:</strong> This report has been prepared in alignment with ESRS. To facilitate analysis by users accustomed to the GRI Standards, the following table maps the identified material ESRS topics to their corresponding GRI Standards.
                    </p>
                </div>

                <div className="overflow-hidden rounded-lg border border-slate-200">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-100 text-slate-700">
                            <tr>
                                <th className="p-3 text-left font-bold border-b border-slate-200">ESRS Topic identified</th>
                                <th className="p-3 text-left font-bold border-b border-slate-200">Corresponding GRI Standard</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {materialTopics.map(topic => (
                                <tr key={topic.id} className="bg-white">
                                    <td className="p-3 font-medium">{topic.topic}</td>
                                    <td className="p-3 font-mono text-xs text-slate-600">
                                        {GRI_MAPPING[topic.topic] || "No direct mapping available"}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Footer */}
            <div className="mt-16 pt-8 border-t border-slate-200 text-center text-xs text-slate-400">
                <p>This Sustainability Statement is generated by Aeternum Ally SaaS.</p>
                <p className="mt-1">Assurance Status: Not externally assured</p>
                <p className="mt-1 text-slate-400">This statement has not been externally assured. The information should be reviewed internally before external use.</p>
            </div>
         </div>
      </div>
    </div>
  );
};

export default SustainabilityStatement;
