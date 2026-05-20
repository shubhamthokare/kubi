'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  ChevronLeft, 
  Download, 
  Share2, 
  Printer,
  Loader2,
  FileText
} from 'lucide-react';
import { kubiApi } from '@/lib/api';
import ReactMarkdown from 'react-markdown';

export default function IncidentReportPage() {
  const { id } = useParams();
  const router = useRouter();
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchReport() {
      try {
        const data = await kubiApi.getIncidentReport(id as string);
        setReport(data.report_md);
      } catch (err) {
        console.error("Failed to fetch report:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchReport();
  }, [id]);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <header className="flex justify-between items-center no-print">
        <button 
          onClick={() => router.back()}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          <ChevronLeft size={20} />
          <span className="font-bold">Back to Incidents</span>
        </button>
        
        <div className="flex gap-3">
          <button className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-slate-300">
            <Share2 size={18} />
          </button>
          <button 
            onClick={() => window.print()}
            className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-slate-300"
          >
            <Printer size={18} />
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-purple-600 rounded-lg hover:bg-purple-500 transition-all text-white font-bold text-sm">
            <Download size={18} />
            Export PDF
          </button>
        </div>
      </header>

      {loading ? (
        <div className="p-20 flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-purple-500" size={48} />
          <p className="text-slate-400 animate-pulse font-medium">Gemini 3 is synthesizing postmortem report...</p>
        </div>
      ) : (
        <article className="glass p-12 bg-white/[0.02] shadow-2xl">
          <div className="flex items-center gap-3 mb-8 text-purple-400 no-print">
            <FileText size={24} />
            <span className="font-bold uppercase tracking-widest text-sm">Official Postmortem Report</span>
          </div>
          
          <div className="prose prose-invert max-w-none 
            prose-headings:text-white prose-p:text-slate-300 prose-strong:text-purple-400
            prose-code:text-cyan-400 prose-pre:bg-black/40 prose-pre:border prose-pre:border-white/5">
            <ReactMarkdown>{report || "No report content generated."}</ReactMarkdown>
          </div>
        </article>
      )}
    </div>
  );
}
