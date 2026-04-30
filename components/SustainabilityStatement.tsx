
import React, { useState } from 'react';
import { CompanyProfile, AssessmentData, SustainabilityBusinessModel } from '../types';
import { GRI_MAPPING } from '../constants';
import { generateSustainabilityStatement, GeneratedStatement } from '../services/geminiService';
import { FileText, Download, Loader2, Book, RefreshCw, ShieldCheck, AlertCircle } from 'lucide-react';

interface Props {
  profile: CompanyProfile;
  assessments: AssessmentData[];
  canvas: SustainabilityBusinessModel;
}

const SustainabilityStatement: React.FC<Props> = ({ profile, assessments, canvas }) => {
  const [generatedContent, setGeneratedContent] = useState<GeneratedStatement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const materialTopics = assessments.filter(a => a.isMaterial);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await generateSustainabilityStatement(profile, materialTopics);
      setGeneratedContent(result);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to generate the report. Please try again.');
    } finally {
      setLoading(false);
    }
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
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
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
          <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Sustainability Statement</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Aligned with ESRS (CSRD) and GRI Standards • FY {new Date().getFullYear()}
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          {!generatedContent ? (
            <button 
                onClick={handleGenerate}
                disabled={loading}
                className="flex items-center justify-center gap-2 bg-esg-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-esg-700 shadow-lg shadow-esg-600/20 transition-all w-full sm:w-auto"
            >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Generate Report (AI)
            </button>
          ) : (
             <button 
                onClick={() => window.print()}
                className="flex items-center justify-center gap-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-6 py-2.5 rounded-lg font-medium hover:bg-slate-800 dark:hover:bg-slate-100 shadow-lg transition-all w-full sm:w-auto"
            >
                <Download className="w-4 h-4" />
                Export to PDF
            </button>
          )}
        </div>
      </div>

      {/* Document View */}
      <div className="bg-white text-slate-900 shadow-xl rounded-xl overflow-hidden print:shadow-none print:rounded-none min-h-[1000px] flex flex-col">
         
         {/* Cover Page Style Header */}
         <div className="bg-slate-900 text-white p-8 md:p-12 print:bg-white print:text-black print:border-b-2 print:border-black">
            <div className="flex justify-between items-start">
                <div>
                    <div className="uppercase tracking-widest text-xs font-bold text-slate-400 mb-4">Sustainability Report {new Date().getFullYear()}</div>
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
                         );
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
                <p className="mt-1">Verification Status: Self-Declared</p>
            </div>
         </div>
      </div>
    </div>
  );
};

export default SustainabilityStatement;
