import React from 'react';
import {
  Search,
  Pause,
  Play,
  Maximize2,
  Download,
  Crosshair,
  Palette,
  CircleDot,
  SlidersHorizontal,
} from 'lucide-react';
import type { CenterMode, ColorMode, NodeSizeMode } from '../types/graph';

interface GraphToolbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  maxAvailableDepth: number;
  depthRange: [number, number];
  onDepthRangeChange: (range: [number, number]) => void;
  nodeSizeMode: NodeSizeMode;
  onNodeSizeModeChange: (mode: NodeSizeMode) => void;
  colorMode: ColorMode;
  onColorModeChange: (mode: ColorMode) => void;
  centerMode: CenterMode;
  onCenterModeChange: (mode: CenterMode) => void;
  isPaused: boolean;
  onTogglePause: () => void;
  onFitScreen: () => void;
  onExportJsonGz: () => void;
  onExportJson: () => void;
  onExportCsv: () => void;
  onExportPng: () => void;
  hasData: boolean;
}

export const GraphToolbar: React.FC<GraphToolbarProps> = ({
  searchQuery,
  onSearchChange,
  maxAvailableDepth,
  depthRange,
  onDepthRangeChange,
  nodeSizeMode,
  onNodeSizeModeChange,
  colorMode,
  onColorModeChange,
  centerMode,
  onCenterModeChange,
  isPaused,
  onTogglePause,
  onFitScreen,
  onExportJsonGz,
  onExportJson,
  onExportCsv,
  onExportPng,
  hasData,
}) => {
  return (
    <div className="border-b border-slate-800 bg-slate-900/80 backdrop-blur px-3 py-2 flex flex-wrap items-center gap-2 z-10 shrink-0">
      {/* Search */}
      <div className="relative min-w-[190px] flex-1 max-w-xs">
        <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Cari judul, DOI, atau penulis..."
          className="w-full pl-8 pr-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 focus:border-sky-500 text-xs text-slate-100 placeholder:text-slate-600 outline-none"
        />
      </div>

      {/* Depth Range Filter */}
      <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-700/80 rounded-lg px-2 py-1 text-xs">
        <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-slate-400 text-[11px]">Depth:</span>
        <input
          type="number"
          min={0}
          max={depthRange[1]}
          value={depthRange[0]}
          onChange={(e) => {
            const v = Math.max(0, Math.min(depthRange[1], Number(e.target.value) || 0));
            onDepthRangeChange([v, depthRange[1]]);
          }}
          className="w-10 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-center font-mono text-[11px] text-slate-200 outline-none"
        />
        <span className="text-slate-500">–</span>
        <input
          type="number"
          min={depthRange[0]}
          max={Math.max(maxAvailableDepth, depthRange[0])}
          value={depthRange[1]}
          onChange={(e) => {
            const v = Math.max(depthRange[0], Number(e.target.value) || 0);
            onDepthRangeChange([depthRange[0], v]);
          }}
          className="w-10 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-center font-mono text-[11px] text-slate-200 outline-none"
        />
      </div>

      {/* Node Sizing */}
      <div className="flex items-center gap-1 bg-slate-950 border border-slate-700/80 rounded-lg px-2 py-1 text-xs">
        <CircleDot className="w-3.5 h-3.5 text-sky-400" />
        <select
          value={nodeSizeMode}
          onChange={(e) => onNodeSizeModeChange(e.target.value as NodeSizeMode)}
          className="bg-transparent text-xs text-slate-200 outline-none cursor-pointer"
          title="Ukuran Node"
        >
          <option value="pagerank" className="bg-slate-900">
            Ukuran: PageRank
          </option>
          <option value="in_degree" className="bg-slate-900">
            Ukuran: Citation / In-Degree
          </option>
          <option value="uniform" className="bg-slate-900">
            Ukuran: Seragam
          </option>
        </select>
      </div>

      {/* Color Mode */}
      <div className="flex items-center gap-1 bg-slate-950 border border-slate-700/80 rounded-lg px-2 py-1 text-xs">
        <Palette className="w-3.5 h-3.5 text-purple-400" />
        <select
          value={colorMode}
          onChange={(e) => onColorModeChange(e.target.value as ColorMode)}
          className="bg-transparent text-xs text-slate-200 outline-none cursor-pointer"
          title="Mode Pewarnaan"
        >
          <option value="depth" className="bg-slate-900">
            Warna: Depth
          </option>
          <option value="year" className="bg-slate-900">
            Warna: Tahun Terbit
          </option>
          <option value="journal" className="bg-slate-900">
            Warna: Jurnal / Venue
          </option>
          <option value="oa" className="bg-slate-900">
            Warna: Status Open Access
          </option>
        </select>
      </div>

      {/* Center Graph Mode */}
      <div className="flex items-center gap-1 bg-slate-950 border border-slate-700/80 rounded-lg px-2 py-1 text-xs">
        <Crosshair className="w-3.5 h-3.5 text-amber-400" />
        <select
          value={centerMode}
          onChange={(e) => onCenterModeChange(e.target.value as CenterMode)}
          className="bg-transparent text-xs text-slate-200 outline-none cursor-pointer"
          title="Pusat Gravitasi & Fokus Kamera"
        >
          <option value="seed" className="bg-slate-900">
            Pusat: Input DOI (Seed)
          </option>
          <option value="top_pagerank" className="bg-slate-900">
            Pusat: Rank #1 PageRank
          </option>
        </select>
      </div>

      {/* Simulation & Camera controls */}
      <div className="flex items-center gap-1.5 ml-auto">
        <button
          type="button"
          onClick={onTogglePause}
          disabled={!hasData}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-medium text-slate-200 border border-slate-700 transition-colors"
          title={isPaused ? 'Lanjutkan Simulasi' : 'Jeda Simulasi'}
        >
          {isPaused ? <Play className="w-3.5 h-3.5 text-emerald-400" /> : <Pause className="w-3.5 h-3.5 text-amber-400" />}
          <span className="hidden xl:inline">{isPaused ? 'Resume' : 'Jeda'}</span>
        </button>

        <button
          type="button"
          onClick={onFitScreen}
          disabled={!hasData}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-medium text-slate-200 border border-slate-700 transition-colors"
          title="Fit Graph ke Layar"
        >
          <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
          <span className="hidden xl:inline">Fit</span>
        </button>

        <div className="flex items-center rounded-lg overflow-hidden border border-slate-700 bg-slate-800">
          <button
            type="button"
            disabled={!hasData}
            onClick={onExportJsonGz}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 hover:bg-slate-700 disabled:opacity-40 text-xs font-medium text-emerald-300 border-r border-slate-700 transition-colors"
            title="Export Compact v2 .json.gz (CompressionStream)"
          >
            <Download className="w-3.5 h-3.5" />
            <span>.json.gz</span>
          </button>
          <button
            type="button"
            disabled={!hasData}
            onClick={onExportJson}
            className="px-2 py-1.5 hover:bg-slate-700 disabled:opacity-40 text-xs text-slate-200 border-r border-slate-700 transition-colors"
            title="Export Compact v2 .json"
          >
            .json
          </button>
          <button
            type="button"
            disabled={!hasData}
            onClick={onExportCsv}
            className="px-2 py-1.5 hover:bg-slate-700 disabled:opacity-40 text-xs text-slate-200 border-r border-slate-700 transition-colors"
            title="Export Ranking CSV"
          >
            .csv
          </button>
          <button
            type="button"
            disabled={!hasData}
            onClick={onExportPng}
            className="px-2 py-1.5 hover:bg-slate-700 disabled:opacity-40 text-xs text-slate-200 transition-colors"
            title="Export Snapshot PNG"
          >
            .png
          </button>
        </div>
      </div>
    </div>
  );
};
