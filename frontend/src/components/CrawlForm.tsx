import React, { useMemo } from 'react';
import { Play, Square, ArrowRightLeft, ArrowUpRight, ArrowDownLeft, Info } from 'lucide-react';
import type { CrawlConfig, CrawlDirection, CrawlProgress } from '../types/graph';
import { parseSeedDois } from '../utils/doi';

interface CrawlFormProps {
  config: CrawlConfig;
  isCrawling: boolean;
  progress: CrawlProgress | null;
  errorMsg: string | null;
  onChange: (next: CrawlConfig) => void;
  onStart: () => void;
  onStop: () => void;
}

const DEPTH_PRESETS = [1, 2, 3, 5, 10];

const EXAMPLE_SEEDS = [
  {
    label: 'AlphaFold 2 (Nature 2021)',
    doi: 'https://doi.org/10.1038/s41586-021-03819-2',
  },
  {
    label: 'CRISPR-Cas9 (Science 2012)',
    doi: 'https://doi.org/10.1126/science.1225829',
  },
  {
    label: 'Multi-Seed Demo',
    doi: '10.1038/s41586-021-03819-2\n10.1126/science.1225829',
  },
];

export const CrawlForm: React.FC<CrawlFormProps> = ({
  config,
  isCrawling,
  progress,
  errorMsg,
  onChange,
  onStart,
  onStop,
}) => {
  const parsedSeeds = useMemo(() => parseSeedDois(config.seedsRaw), [config.seedsRaw]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isCrawling && parsedSeeds.length > 0) {
      onStart();
    }
  };

  const directions: { value: CrawlDirection; label: string; desc: string; icon: React.ReactNode }[] =
    [
      {
        value: 'references',
        label: 'References',
        desc: 'Paper yang dikutip',
        icon: <ArrowUpRight className="w-3.5 h-3.5" />,
      },
      {
        value: 'citations',
        label: 'Citations',
        desc: 'Paper yang mengutip',
        icon: <ArrowDownLeft className="w-3.5 h-3.5" />,
      },
      {
        value: 'both',
        label: 'Both',
        desc: 'Dua arah',
        icon: <ArrowRightLeft className="w-3.5 h-3.5" />,
      },
    ];

  return (
    <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto h-full">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Seed DOI (Single / Multi)
          </label>
          <span className="text-[11px] font-mono text-sky-400">
            {parsedSeeds.length} valid DOI
          </span>
        </div>
        <textarea
          rows={4}
          value={config.seedsRaw}
          onChange={(e) => onChange({ ...config, seedsRaw: e.target.value })}
          placeholder={'https://doi.org/10.1038/s41586-021-03819-2\n10.1126/science.1225829'}
          className="w-full rounded-lg bg-slate-950 border border-slate-700 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 px-3 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-600 resize-y outline-none"
        />
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {EXAMPLE_SEEDS.map((ex) => (
            <button
              key={ex.label}
              type="button"
              onClick={() => onChange({ ...config, seedsRaw: ex.doi })}
              className="text-[11px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/80 transition-colors"
            >
              {ex.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
            Max Depth (n)
          </label>
          <input
            type="number"
            min={0}
            step={1}
            value={config.maxDepth}
            onChange={(e) => {
              const val = Number.parseInt(e.target.value, 10);
              onChange({ ...config, maxDepth: Number.isNaN(val) ? 0 : Math.max(0, val) });
            }}
            className="w-full rounded-lg bg-slate-950 border border-slate-700 focus:border-sky-500 px-3 py-1.5 text-sm font-mono text-slate-100 outline-none"
          />
          <div className="mt-1.5 flex flex-wrap gap-1">
            {DEPTH_PRESETS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onChange({ ...config, maxDepth: d })}
                className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-colors ${
                  config.maxDepth === d
                    ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                d={d}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
            Max Papers
          </label>
          <input
            type="number"
            min={1}
            max={10000}
            step={10}
            value={config.maxPapers}
            onChange={(e) => {
              const val = Number.parseInt(e.target.value, 10);
              onChange({
                ...config,
                maxPapers: Number.isNaN(val) ? 50 : Math.min(10000, Math.max(1, val)),
              });
            }}
            className="w-full rounded-lg bg-slate-950 border border-slate-700 focus:border-sky-500 px-3 py-1.5 text-sm font-mono text-slate-100 outline-none"
          />
          <div className="mt-1.5 flex flex-wrap gap-1">
            {[50, 150, 300, 500].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onChange({ ...config, maxPapers: m })}
                className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-colors ${
                  config.maxPapers === m
                    ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
          Arah Penelusuran Relasi
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {directions.map((dir) => {
            const active = config.direction === dir.value;
            return (
              <button
                key={dir.value}
                type="button"
                onClick={() => onChange({ ...config, direction: dir.value })}
                className={`flex flex-col items-start p-2 rounded-lg border text-left transition-colors ${
                  active
                    ? 'bg-sky-500/15 border-sky-500 text-sky-200'
                    : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-1 text-xs font-semibold">
                  {dir.icon}
                  <span>{dir.label}</span>
                </div>
                <span className="text-[10px] opacity-80 mt-0.5">{dir.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        {!isCrawling ? (
          <button
            type="submit"
            disabled={parsedSeeds.length === 0}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm shadow-lg shadow-sky-500/20 transition-all"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Mulai Crawl BFS</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onStop}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm shadow-lg shadow-rose-600/25 transition-all"
          >
            <Square className="w-4 h-4 fill-current" />
            <span>Stop / Cancel</span>
          </button>
        )}
      </div>

      {progress && (
        <div className="rounded-lg bg-slate-950 border border-slate-800 p-3 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-sky-300 font-medium">
              {isCrawling ? `Depth ${progress.depth} · BFS Aktif` : 'Status Terakhir'}
            </span>
            <span className="font-mono text-slate-400">
              {progress.nodes} node · {progress.edges} edge
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-300"
              style={{
                width: `${Math.min(100, Math.round((progress.nodes / Math.max(1, config.maxPapers)) * 100))}%`,
              }}
            />
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">{progress.message}</p>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-lg bg-rose-950/60 border border-rose-500/40 p-3 text-xs text-rose-200">
          {errorMsg}
        </div>
      )}

      <div className="rounded-lg bg-slate-900/70 border border-slate-800/90 p-3 text-[11px] text-slate-400 space-y-1.5">
        <div className="flex items-center gap-1.5 text-slate-300 font-medium">
          <Info className="w-3.5 h-3.5 text-sky-400" />
          <span>Arsitektur Data & Visualisasi</span>
        </div>
        <p>
          Metadata diambil asinkron via <strong>OpenAlex</strong>, <strong>Semantic Scholar</strong>,
          & <strong>Crossref</strong> dengan fallback <code>doi.org</code>.
        </p>
        <p>
          Edge berarah <code>A → B</code> berarti <strong>Paper A mengutip Paper B</strong>. Drag &
          drop file <code>.json</code> atau <code>.json.gz</code> ke kanvas untuk muat ulang instan.
        </p>
      </div>
    </form>
  );
};
