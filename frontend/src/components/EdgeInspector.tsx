import React from 'react';
import { ArrowRight, X } from 'lucide-react';
import type { GraphEdge, PaperNode } from '../types/graph';

interface EdgeInspectorProps {
  edge: GraphEdge;
  nodes: PaperNode[];
  onClose: () => void;
  onSelectNode: (node: PaperNode) => void;
}

export const EdgeInspector: React.FC<EdgeInspectorProps> = ({
  edge,
  nodes,
  onClose,
  onSelectNode,
}) => {
  const sourceNode = nodes.find((n) => n.doi === edge.source);
  const targetNode = nodes.find((n) => n.doi === edge.target);

  return (
    <div className="absolute bottom-4 right-4 z-30 w-96 max-w-[calc(100vw-2rem)] rounded-xl bg-slate-900/95 backdrop-blur border border-slate-700 shadow-2xl p-3.5 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
          Relasi Sitasi (A → B)
        </span>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-2 text-xs">
        <button
          type="button"
          disabled={!sourceNode}
          onClick={() => sourceNode && onSelectNode(sourceNode)}
          className="w-full text-left p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-sky-500/50 transition-colors"
        >
          <div className="text-[10px] text-sky-400 font-semibold uppercase">
            Pengutip (Citing Paper) {sourceNode ? `· Rank #${sourceNode.rank}` : ''}
          </div>
          <div className="font-medium text-slate-100 line-clamp-2 mt-0.5">
            {sourceNode?.title ?? edge.source}
          </div>
          <div className="font-mono text-[10px] text-slate-400 truncate">{edge.source}</div>
        </button>

        <div className="flex items-center justify-center text-slate-400 gap-1 text-[11px]">
          <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
          <span>mengutip</span>
        </div>

        <button
          type="button"
          disabled={!targetNode}
          onClick={() => targetNode && onSelectNode(targetNode)}
          className="w-full text-left p-2 rounded-lg bg-slate-950 border border-slate-800 hover:border-sky-500/50 transition-colors"
        >
          <div className="text-[10px] text-indigo-400 font-semibold uppercase">
            Dikutip (Cited Reference) {targetNode ? `· Rank #${targetNode.rank}` : ''}
          </div>
          <div className="font-medium text-slate-100 line-clamp-2 mt-0.5">
            {targetNode?.title ?? edge.target}
          </div>
          <div className="font-mono text-[10px] text-slate-400 truncate">{edge.target}</div>
        </button>
      </div>
    </div>
  );
};
