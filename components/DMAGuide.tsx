import React, { useState, useEffect } from 'react';
import { getDMAGuide } from '../services/geminiService';
import { CompanyProfile } from '../types';
import { Sparkles, AlertTriangle, Loader2 } from 'lucide-react';

interface Props {
  profile: CompanyProfile;
}

const DMAGuide: React.FC<Props> = ({ profile }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guide, setGuide] = useState<{ message: string; topics: { topic: string; reason: string; esrs_ref: string }[] } | null>(null);

  useEffect(() => {
    const fetchGuide = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getDMAGuide(profile);
        setGuide(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load DMA Guide');
      } finally {
        setLoading(false);
      }
    };
    fetchGuide();
  }, [profile]);

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 flex flex-col items-center justify-center min-h-[300px]">
        <Loader2 className="w-8 h-8 text-esg-500 animate-spin mb-3" />
        <p className="text-sm text-slate-500 dark:text-slate-400">Consulting AI for DMA Guide...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-red-200 dark:border-red-800 p-5 flex flex-col items-center justify-center min-h-[300px]">
        <AlertTriangle className="w-8 h-8 text-red-500 mb-3" />
        <p className="text-sm text-red-600 dark:text-red-400 mb-2">Failed to load DMA Guide</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 text-center">{error}</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 h-full">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-esg-500" />
        <h3 className="font-bold text-slate-800 dark:text-white text-sm">AI DMA Guide</h3>
      </div>
      
      {guide && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {guide.message}
          </p>
          
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Top 3 Recommended Topics</p>
            {guide.topics.map((t, i) => (
              <div key={i} className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">{t.topic}</p>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-mono flex-shrink-0">
                    {t.esrs_ref}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DMAGuide;
