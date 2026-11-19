import React, { useMemo, useState } from 'react';
import {
  X,
  ExternalLink,
  FileText,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import type { GraphEdge, PaperNode } from '../types/graph';
import { doiToUrl } from '../utils/doi';

interface PaperInspectorProps {
  node: PaperNode;
  allNodes: PaperNode[];
  edges: GraphEdge[];
  onClose: () => void;
  onSelectNode: (node: PaperNode) => void;
  onReseedAndCrawl: (doi: string) => void;
}

const PAGE_SIZE = 50;

export const PaperInspector: React.FC<PaperInspectorProps> = ({
  node,
  allNodes,
  edges,
  onClose,
  onSelectNode,
  onReseedAndCrawl,
}) => {
  const [tab, setTab] = useState<'references' | 'cited_by'>('references');
  const [refPage, setRefPage] = useState(1);
  const [citePage, setCitePage] = useState(1);

  const nodeMap = useMemo(() => {
    const m = new Map<string, PaperNode>();
    allNodes.forEach((n) => m.set(n.doi, n));
    return m;
  }, [allNodes]);

  // A -> B means A cites B.
  // So References of `node` are targets B where edge.source === node.doi
  // Cited By of `node` are sources A where edge.target === node.doi
  const { references, citedBy } = useMemo(() => {
    const refs: PaperNode[] = [];
    const cites: PaperNode[] = [];
    const seenRefs = new Set<string>();
    const seenCites = new Set<string>();

    for (const e of edges) {
      if (e.source === node.doi && !seenRefs.has(e.target)) {
        seenRefs.add(e.target);
        const targetNode = nodeMap.get(e.target);
        if (targetNode) refs.push(targetNode);
      }
      if (e.target === node.doi && !seenCites.has(e.source)) {
        seenCites.add(e.source);
        const sourceNode = nodeMap.get(e.source);
        if (sourceNode) cites.push(sourceNode);
      }
    }

    refs.sort((a, b) => a.rank - b.rank);
    cites.sort((a, b) => a.rank - b.rank);
    return { references: refs, citedBy: cites };
  }, [edges, node.doi, nodeMap]);

  const activeList = tab === 'references' ? references : citedBy;
  const activePage = tab === 'references' ? refPage : citePage;
  const setActivePage = tab === 'references' ? setRefPage : setCitePage;
  const totalPages = Math.max(1, Math.ceil(activeList.length / PAGE_SIZE));
  const safePage = Math.min(activePage, totalPages);
  const pageItems = activeList.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <aside className="w-80 lg:w-96 shrink-0 border-l border-slate-800 bg-slate-900/95 backdrop-blur flex flex-col h-full overflow-hidden z-20">
      <div className="p-3.5 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 text-xs font-mono font-bold">
            Rank #{node.rank}
          </span>
          <span className="text-xs font-mono text-amber-300">
            {(node.pagerank * 100).toFixed(3)}%
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 border-b border-slate-800 space-y-3 overflow-y-auto max-h-[52%] shrink-0">
        <h3 className="text-sm font-semibold text-white leading-snug">{node.title}</h3>

        {node.authors.length > 0 && (
          <p className="text-xs text-slate-300 leading-relaxed">
            {node.authors.slice(0, 8).join(', ')}
            {node.authors.length > 8 ? ` (+${node.authors.length - 8} lainnya)` : ''}
          </p>
        )}

        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
            Tahun: {node.year ?? '—'}
          </span>
          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
            Depth: {node.depth}
          </span>
          <span
            className={`px-2 py-0.5 rounded ${
              node.is_oa
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {node.is_oa ? 'Open Access' : 'Closed / Non-OA'}
          </span>
        </div>

        {node.journal && (
          <p className="text-xs text-slate-400">
            Jurnal/Venue: <span className="text-slate-200">{node.journal}</span>
          </p>
        )}

        <div className="grid grid-cols-3 gap-2 text-center bg-slate-950/80 border border-slate-800 rounded-lg p-2">
          <div>
            <div className="text-[10px] text-slate-500 uppercase">In-Degree</div>
            <div className="text-sm font-mono font-semibold text-sky-300">{node.in_degree}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase">Out-Degree</div>
            <div className="text-sm font-mono font-semibold text-indigo-300">{node.out_degree}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase">Global Cites</div>
            <div className="text-sm font-mono font-semibold text-amber-300">
              {node.citation_count}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={doiToUrl(node.doi)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 text-xs font-medium transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Buka DOI</span>
          </a>
          {node.oa_url && (
            <a
              href={node.oa_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-medium transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>PDF / OA</span>
            </a>
          )}
        </div>

        <button
          type="button"
          onClick={() => onReseedAndCrawl(node.doi)}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-xs font-semibold shadow-md transition-all"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Jadikan Seed & Crawl Ulang</span>
        </button>
      </div>

      {/* Neighbor Tabs (References & Cited By, 50 items per page) */}
      <div className="grid grid-cols-2 border-b border-slate-800 bg-slate-950/60 p-1 gap-1 shrink-0">
        <button
          type="button"
          onClick={() => setTab('references')}
          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-xs font-medium transition-colors ${
            tab === 'references' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ArrowUpRight className="w-3.5 h-3.5 text-indigo-400" />
          <span>References ({references.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('cited_by')}
          className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-xs font-medium transition-colors ${
            tab === 'cited_by' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ArrowDownLeft className="w-3.5 h-3.5 text-sky-400" />
          <span>Cited By ({citedBy.length})</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/70">
        {pageItems.length === 0 ? (
          <div className="p-5 text-center text-xs text-slate-500">
            Tidak ada paper pada daftar ini di graph saat ini.
          </div>
        ) : (
          pageItems.map((item) => (
            <button
              key={item.doi}
              type="button"
              onClick={() => onSelectNode(item)}
              className="w-full text-left p-2.5 hover:bg-slate-800/60 transition-colors"
            >
              <div className="flex items-center justify-between gap-2 text-[11px] mb-0.5">
                <span className="font-mono text-sky-400 font-semibold">Rank #{item.rank}</span>
                <span className="font-mono text-slate-500">{item.year ?? '—'}</span>
              </div>
              <p className="text-xs text-slate-200 line-clamp-2 leading-snug">{item.title}</p>
              <p className="text-[10px] font-mono text-slate-500 truncate mt-0.5">{item.doi}</p>
            </button>
          ))
        )}
      </div>

      {activeList.length > 0 && (
        <div className="p-2 border-t border-slate-800 bg-slate-900 flex items-center justify-between text-xs shrink-0">
          <span className="text-slate-400 text-[11px]">
            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, activeList.length)} /{' '}
            {activeList.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setActivePage((p) => Math.max(1, p - 1))}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 font-mono text-[11px] text-slate-300">
              {safePage}/{totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setActivePage((p) => Math.min(totalPages, p + 1))}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};
