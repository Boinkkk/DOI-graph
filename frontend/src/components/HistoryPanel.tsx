import React from 'react';
import { History, RotateCcw, Download, Trash2, RefreshCw } from 'lucide-react';
import type { HistorySummary } from '../types/graph';
import { getHistoryDownloadUrl } from '../api/client';

interface HistoryPanelProps {
  items: HistorySummary[];
  loading: boolean;
  onRefresh: () => void;
  onLoadItem: (id: string) => void;
  onDeleteItem: (id: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({
  items,
  loading,
  onRefresh,
  onLoadItem,
  onDeleteItem,
}) => {
  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
          <History className="w-4 h-4 text-sky-400" />
          <span>Auto-Save SQLite + zlib</span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/80">
        {items.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            Belum ada riwayat crawl tersimpan. Setiap crawl otomatis disimpan dalam format kompak
            terkompresi zlib.
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="p-3 space-y-2 hover:bg-slate-900/50">
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-xs font-semibold text-slate-100 line-clamp-2 leading-snug">
                  {item.title}
                </h4>
                {item.cancelled && (
                  <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    Parsial
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-slate-400 font-mono">
                <span>{item.node_count} paper</span>
                <span>·</span>
                <span>{item.edge_count} sitasi</span>
                <span>·</span>
                <span>d={item.max_depth}</span>
                <span>·</span>
                <span className="text-emerald-400">{formatBytes(item.compressed_bytes)}</span>
              </div>

              <div className="text-[10px] text-slate-500">
                {new Date(item.created_at).toLocaleString('id-ID')} · {item.direction}
              </div>

              <div className="flex items-center gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => onLoadItem(item.id)}
                  className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 text-[11px] font-medium transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Muat Ulang</span>
                </button>
                <a
                  href={getHistoryDownloadUrl(item.id)}
                  download
                  className="inline-flex items-center justify-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] transition-colors"
                  title="Unduh .json.gz"
                >
                  <Download className="w-3 h-3 text-emerald-400" />
                  <span>.json.gz</span>
                </a>
                <button
                  type="button"
                  onClick={() => onDeleteItem(item.id)}
                  className="p-1 rounded bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 border border-slate-700 transition-colors"
                  title="Hapus riwayat"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
