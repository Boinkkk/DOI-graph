import React, { useMemo, useState } from 'react';
import { Search, Download, ChevronLeft, ChevronRight, Award } from 'lucide-react';
import type { PaperNode } from '../types/graph';
import { exportRankingCsv } from '../utils/compactCodec';

interface RankingPanelProps {
  nodes: PaperNode[];
  selectedDoi: string | null;
  onSelectNode: (node: PaperNode) => void;
}

const PAGE_SIZE = 50;

export const RankingPanel: React.FC<RankingPanelProps> = ({
  nodes,
  selectedDoi,
  onSelectNode,
}) => {
  const [query, setQuery] = useState('');
  const [depthFilter, setDepthFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  const availableDepths = useMemo(() => {
    const set = new Set<number>();
    nodes.forEach((n) => set.add(n.depth));
    return [...set].sort((a, b) => a - b);
  }, [nodes]);

  const sortedAndFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...nodes].sort((a, b) => a.rank - b.rank);
    return sorted.filter((n) => {
      if (depthFilter !== 'all' && n.depth !== Number(depthFilter)) return false;
      if (!q) return true;
      return (
        n.title.toLowerCase().includes(q) ||
        n.doi.toLowerCase().includes(q) ||
        n.authors.some((a) => a.toLowerCase().includes(q)) ||
        (n.journal ?? '').toLowerCase().includes(q)
      );
    });
  }, [nodes, query, depthFilter]);

  const maxPageRank = useMemo(
    () => nodes.reduce((m, n) => Math.max(m, n.pagerank), 0) || 1,
    [nodes]
  );

  const totalPages = Math.max(1, Math.ceil(sortedAndFiltered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = sortedAndFiltered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-slate-800 space-y-2.5 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
            <Award className="w-4 h-4 text-amber-400" />
            <span>PageRank (d = 0.85)</span>
          </div>
          <button
            type="button"
            disabled={nodes.length === 0}
            onClick={() => exportRankingCsv(sortedAndFiltered)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 transition-colors"
          >
            <Download className="w-3 h-3 text-emerald-400" />
            <span>Export CSV</span>
          </button>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Cari judul, DOI, penulis..."
              className="w-full pl-8 pr-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 focus:border-sky-500 text-xs text-slate-100 placeholder:text-slate-600 outline-none"
            />
          </div>
          <select
            value={depthFilter}
            onChange={(e) => {
              setDepthFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs text-slate-200 outline-none"
          >
            <option value="all">Semua Depth</option>
            {availableDepths.map((d) => (
              <option key={d} value={String(d)}>
                Depth {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/70">
        {pageItems.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            {nodes.length === 0
              ? 'Belum ada data paper. Jalankan crawl atau upload file .json / .json.gz.'
              : 'Tidak ada paper yang cocok dengan filter.'}
          </div>
        ) : (
          pageItems.map((node) => {
            const relWidth = Math.max(3, Math.round((node.pagerank / maxPageRank) * 100));
            const isSelected = node.doi === selectedDoi;
            return (
              <button
                key={node.doi}
                type="button"
                onClick={() => onSelectNode(node)}
                className={`w-full text-left p-3 hover:bg-slate-800/60 transition-colors ${
                  isSelected ? 'bg-sky-500/15 border-l-2 border-l-sky-400' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold ${
                        node.rank === 1
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : node.rank <= 3
                            ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                            : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      Rank #{node.rank}
                    </span>
                    {node.is_seed && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        SEED
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-slate-500">d={node.depth}</span>
                  </div>
                  <span className="text-[11px] font-mono text-sky-300 font-semibold">
                    {(node.pagerank * 100).toFixed(2)}%
                  </span>
                </div>

                <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden mb-1.5">
                  <div
                    className="h-full bg-gradient-to-r from-sky-500 to-indigo-400 rounded-full"
                    style={{ width: `${relWidth}%` }}
                  />
                </div>

                <p className="text-xs font-medium text-slate-100 line-clamp-2 leading-snug">
                  {node.title}
                </p>
                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400 gap-2">
                  <span className="truncate font-mono">{node.doi}</span>
                  <span className="shrink-0 font-mono text-[10px] text-slate-400">
                    In:{node.in_degree} Out:{node.out_degree}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {sortedAndFiltered.length > 0 && (
        <div className="p-2.5 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between text-xs shrink-0">
          <span className="text-slate-400">
            {(safePage - 1) * PAGE_SIZE + 1}–
            {Math.min(safePage * PAGE_SIZE, sortedAndFiltered.length)} dari{' '}
            {sortedAndFiltered.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-mono text-slate-300">
              {safePage}/{totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
