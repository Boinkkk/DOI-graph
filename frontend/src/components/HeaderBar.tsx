import React, { useRef } from 'react';
import { GitFork, Upload, Sparkles, Activity } from 'lucide-react';

interface HeaderBarProps {
  nodeCount: number;
  edgeCount: number;
  maxDepthReached: number;
  isCrawling: boolean;
  statusText: string;
  onUploadFile: (file: File) => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  nodeCount,
  edgeCount,
  maxDepthReached,
  isCrawling,
  statusText,
  onUploadFile,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadFile(file);
      e.target.value = '';
    }
  };

  return (
    <header className="h-14 shrink-0 border-b border-slate-800 bg-slate-900/90 backdrop-blur px-4 flex items-center justify-between gap-4 z-20">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20 shrink-0">
          <GitFork className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-base tracking-tight text-white">DOI-Graph</h1>
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/20">
              <Sparkles className="w-3 h-3" /> Citation Network & PageRank
            </span>
          </div>
          <p className="text-xs text-slate-400 truncate">{statusText}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {isCrawling && (
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-medium animate-pulse">
            <Activity className="w-3.5 h-3.5" />
            Live Crawling
          </div>
        )}

        <div className="hidden sm:flex items-center gap-2 text-xs bg-slate-800/80 border border-slate-700/80 rounded-lg px-3 py-1.5">
          <span className="text-slate-400">
            Paper: <strong className="text-slate-100 font-semibold">{nodeCount}</strong>
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400">
            Sitasi: <strong className="text-slate-100 font-semibold">{edgeCount}</strong>
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400">
            Depth: <strong className="text-slate-100 font-semibold">{maxDepthReached}</strong>
          </span>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.gz,.json.gz,application/json,application/gzip"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-colors"
          title="Upload file .json atau .json.gz untuk visualisasi instan di browser"
        >
          <Upload className="w-3.5 h-3.5 text-sky-400" />
          <span>Upload .json / .gz</span>
        </button>
      </div>
    </header>
  );
};
