import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import { UploadCloud, GitFork, Zap } from 'lucide-react';
import type {
  CenterMode,
  ColorMode,
  GraphEdge,
  NodeSizeMode,
  PaperNode,
} from '../types/graph';
import { buildColorLegend, getNodeColor } from '../utils/colors';

interface FGNode extends PaperNode {
  id: string;
  _color: string;
  _radius: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface FGLink {
  source: string | FGNode;
  target: string | FGNode;
}

export interface GraphCanvasHandle {
  fitToScreen: () => void;
  focusNode: (doi: string) => void;
  exportPng: () => void;
}

interface GraphCanvasProps {
  nodes: PaperNode[];
  edges: GraphEdge[];
  searchQuery: string;
  depthRange: [number, number];
  nodeSizeMode: NodeSizeMode;
  colorMode: ColorMode;
  centerMode: CenterMode;
  isPaused: boolean;
  selectedDoi: string | null;
  selectedEdge: GraphEdge | null;
  onSelectNode: (node: PaperNode | null) => void;
  onSelectEdge: (edge: GraphEdge | null) => void;
  onDropFile: (file: File) => void;
}

const LOD_EDGE_THRESHOLD = 1000;
const LOD_NODE_THRESHOLD = 600;

export const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(
  (
    {
      nodes,
      edges,
      searchQuery,
      depthRange,
      nodeSizeMode,
      colorMode,
      centerMode,
      isPaused,
      selectedDoi,
      selectedEdge,
      onSelectNode,
      onSelectEdge,
      onDropFile,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const lastMouseRef = useRef<{ x: number; y: number }>({ x: 16, y: 16 });
    const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
    const positionCacheRef = useRef<Map<string, { x: number; y: number; vx: number; vy: number }>>(
      new Map()
    );
    const activeNodesRef = useRef<FGNode[]>([]);

    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
    const [hoveredNode, setHoveredNode] = useState<FGNode | null>(null);
    const [isDraggingFile, setIsDraggingFile] = useState(false);

    // Keep hot-path lookup values in refs so ForceGraph2D callbacks stay stable across hover/click
    const hoveredDoiRef = useRef<string | null>(null);
    const selectedDoiRef = useRef<string | null>(selectedDoi);
    const selectedEdgeRef = useRef<GraphEdge | null>(selectedEdge);

    selectedDoiRef.current = selectedDoi;
    selectedEdgeRef.current = selectedEdge;

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const update = () => {
        setDimensions({
          width: Math.max(200, el.clientWidth),
          height: Math.max(200, el.clientHeight),
        });
      };
      update();
      const observer = new ResizeObserver(update);
      observer.observe(el);
      return () => observer.disconnect();
    }, []);

    const yearRange = useMemo<[number, number]>(() => {
      let minY = Infinity;
      let maxY = -Infinity;
      for (const n of nodes) {
        if (typeof n.year === 'number') {
          if (n.year < minY) minY = n.year;
          if (n.year > maxY) maxY = n.year;
        }
      }
      if (!Number.isFinite(minY) || !Number.isFinite(maxY)) return [2000, 2025];
      return [minY, maxY];
    }, [nodes]);

    const legend = useMemo(
      () => buildColorLegend(nodes, colorMode, yearRange),
      [nodes, colorMode, yearRange]
    );

    const visibleNodeSet = useMemo(() => {
      const set = new Set<string>();
      for (const n of nodes) {
        if (n.depth >= depthRange[0] && n.depth <= depthRange[1]) {
          set.add(n.doi);
        }
      }
      return set;
    }, [nodes, depthRange]);

    const searchMatchSet = useMemo(() => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return null;
      const matches = new Set<string>();
      for (const n of nodes) {
        if (
          n.title.toLowerCase().includes(q) ||
          n.doi.toLowerCase().includes(q) ||
          n.authors.some((a) => a.toLowerCase().includes(q))
        ) {
          matches.add(n.doi);
        }
      }
      return matches;
    }, [nodes, searchQuery]);

    const searchMatchSetRef = useRef<Set<string> | null>(searchMatchSet);
    searchMatchSetRef.current = searchMatchSet;

    const maxPageRank = useMemo(
      () => nodes.reduce((m, n) => Math.max(m, n.pagerank), 0) || 1,
      [nodes]
    );
    const maxInDegree = useMemo(
      () => nodes.reduce((m, n) => Math.max(m, n.in_degree), 0) || 1,
      [nodes]
    );

    // Snapshot latest node coordinates before building updated graphData
    const snapshotPositions = useCallback(() => {
      for (const n of activeNodesRef.current) {
        if (typeof n.x === 'number' && typeof n.y === 'number') {
          positionCacheRef.current.set(n.doi, {
            x: n.x,
            y: n.y,
            vx: n.vx ?? 0,
            vy: n.vy ?? 0,
          });
        }
      }
    }, []);

    const graphData = useMemo(() => {
      snapshotPositions();

      const fgNodes: FGNode[] = [];
      for (const n of nodes) {
        if (!visibleNodeSet.has(n.doi)) continue;
        const cached = positionCacheRef.current.get(n.doi);
        let radius = 6;
        if (nodeSizeMode === 'in_degree') {
          radius = 4.5 + Math.sqrt(n.in_degree / maxInDegree) * 11;
        } else if (nodeSizeMode === 'pagerank') {
          radius = 4.5 + Math.sqrt(n.pagerank / maxPageRank) * 12;
        }

        fgNodes.push({
          ...n,
          id: n.doi,
          _color: getNodeColor(n, colorMode, yearRange),
          _radius: radius,
          x: cached?.x,
          y: cached?.y,
          vx: cached?.vx,
          vy: cached?.vy,
        });
      }

      const fgLinks: FGLink[] = [];
      for (const e of edges) {
        if (visibleNodeSet.has(e.source) && visibleNodeSet.has(e.target)) {
          fgLinks.push({ source: e.source, target: e.target });
        }
      }

      activeNodesRef.current = fgNodes;
      return { nodes: fgNodes, links: fgLinks };
    }, [
      nodes,
      edges,
      visibleNodeSet,
      nodeSizeMode,
      maxInDegree,
      maxPageRank,
      colorMode,
      yearRange,
      snapshotPositions,
    ]);

    const isLargeGraph =
      graphData.links.length > LOD_EDGE_THRESHOLD || graphData.nodes.length > LOD_NODE_THRESHOLD;

    // O(N) scan instead of copying & sorting all nodes
    const centerTargetDoi = useMemo(() => {
      if (graphData.nodes.length === 0) return null;
      if (centerMode === 'top_pagerank') {
        let best = graphData.nodes[0];
        for (let i = 1; i < graphData.nodes.length; i++) {
          if (graphData.nodes[i].rank < best.rank) {
            best = graphData.nodes[i];
          }
        }
        return best.doi;
      }
      const seedNode = graphData.nodes.find((n) => n.is_seed);
      return seedNode?.doi ?? graphData.nodes[0]?.doi ?? null;
    }, [graphData.nodes, centerMode]);

    const centerTargetDoiRef = useRef<string | null>(centerTargetDoi);
    centerTargetDoiRef.current = centerTargetDoi;

    useEffect(() => {
      const fg = fgRef.current;
      if (!fg) return;

      fg.d3Force('centerAnchor', (alpha: number) => {
        const targetDoi = centerTargetDoiRef.current;
        if (!targetDoi) return;
        for (const node of graphData.nodes) {
          if (node.doi === targetDoi) {
            node.vx = (node.vx ?? 0) + (0 - (node.x ?? 0)) * 0.25 * alpha;
            node.vy = (node.vy ?? 0) + (0 - (node.y ?? 0)) * 0.25 * alpha;
            break;
          }
        }
      });
    }, [centerTargetDoi, graphData.nodes]);

    useEffect(() => {
      if (!centerTargetDoi || !fgRef.current) return;
      const target = graphData.nodes.find((n) => n.doi === centerTargetDoi);
      if (target && typeof target.x === 'number' && typeof target.y === 'number') {
        fgRef.current.centerAt(target.x, target.y, 500);
      }
    }, [centerMode, centerTargetDoi, graphData.nodes]);

    useImperativeHandle(
      ref,
      () => ({
        fitToScreen: () => {
          fgRef.current?.zoomToFit(500, 60);
        },
        focusNode: (doi: string) => {
          const target = graphData.nodes.find((n) => n.doi === doi);
          if (target && typeof target.x === 'number' && typeof target.y === 'number') {
            fgRef.current?.centerAt(target.x, target.y, 500);
            fgRef.current?.zoom(2.2, 500);
          }
        },
        exportPng: () => {
          const canvas = containerRef.current?.querySelector('canvas');
          if (!canvas) return;
          const link = document.createElement('a');
          link.download = `doi-graph-${new Date().toISOString().slice(0, 10)}.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();
        },
      }),
      [graphData.nodes]
    );

    const drawNode = useCallback(
      (rawNode: object, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const node = rawNode as FGNode;
        const x = node.x ?? 0;
        const y = node.y ?? 0;
        const r = node._radius;
        const isHovered = hoveredDoiRef.current === node.doi;
        const isSelected = selectedDoiRef.current === node.doi;
        const isCenterTarget = centerTargetDoiRef.current === node.doi;
        const matchSet = searchMatchSetRef.current;
        const isDimmed = matchSet !== null && !matchSet.has(node.doi);

        const prevAlpha = ctx.globalAlpha;
        ctx.globalAlpha = isDimmed ? 0.16 : 0.96;

        // Outer halo for seed, Rank #1, or selected node
        if (isSelected || isHovered || node.is_seed || node.rank === 1 || isCenterTarget) {
          ctx.beginPath();
          ctx.arc(x, y, r + 3 / Math.max(0.8, Math.sqrt(globalScale)), 0, 2 * Math.PI);
          ctx.strokeStyle = isSelected
            ? '#ffffff'
            : isHovered
              ? '#38bdf8'
              : node.rank === 1
                ? '#facc15'
                : '#f59e0b';
          ctx.lineWidth = (isSelected || isHovered ? 2.4 : 1.5) / Math.max(0.8, globalScale * 0.7);
          ctx.stroke();
        }

        // Main node circle using precomputed color
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 2 * Math.PI);
        ctx.fillStyle = node._color;
        ctx.fill();

        // Skip crisp thin outline when zoomed far out on large graphs
        if (!isLargeGraph || globalScale > 0.75 || isHovered || isSelected) {
          ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
          ctx.lineWidth = 1 / Math.max(0.8, globalScale);
          ctx.stroke();
        }

        // Label ONLY on hover
        if (isHovered) {
          ctx.save();
          const shortTitle =
            node.title.length > 36 ? `${node.title.slice(0, 34)}…` : node.title;
          const label = `Rank #${node.rank} · ${(node.pagerank * 100).toFixed(2)}% · ${shortTitle}`;
          const fontSize = Math.max(10, 12 / globalScale);
          ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
          const textWidth = ctx.measureText(label).width;
          const padX = 6 / globalScale;
          const padY = 3 / globalScale;
          const boxW = textWidth + padX * 2;
          const boxH = fontSize + padY * 2;
          const boxX = x - boxW / 2;
          const boxY = y - r - boxH - 6 / globalScale;

          ctx.globalAlpha = 0.95;
          ctx.fillStyle = 'rgba(2, 6, 23, 0.92)';
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
          ctx.lineWidth = 1 / globalScale;

          ctx.beginPath();
          ctx.roundRect(boxX, boxY, boxW, boxH, 4 / globalScale);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#f8fafc';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, x, boxY + boxH / 2);
          ctx.restore();
        }

        ctx.globalAlpha = prevAlpha;
      },
      [isLargeGraph]
    );

    const nodePointerAreaPaint = useCallback(
      (rawNode: object, color: string, ctx: CanvasRenderingContext2D) => {
        const node = rawNode as FGNode;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(node.x ?? 0, node.y ?? 0, node._radius + 3, 0, 2 * Math.PI);
        ctx.fill();
      },
      []
    );

    const getLinkColor = useCallback((rawLink: object) => {
      const link = rawLink as FGLink;
      const src = typeof link.source === 'string' ? link.source : link.source.id;
      const tgt = typeof link.target === 'string' ? link.target : link.target.id;

      const selEdge = selectedEdgeRef.current;
      if (selEdge && selEdge.source === src && selEdge.target === tgt) {
        return '#facc15';
      }
      const hovDoi = hoveredDoiRef.current;
      if (hovDoi && (src === hovDoi || tgt === hovDoi)) {
        return 'rgba(56, 189, 248, 0.9)';
      }
      const selDoi = selectedDoiRef.current;
      if (selDoi && (src === selDoi || tgt === selDoi)) {
        return 'rgba(56, 189, 248, 0.7)';
      }
      const matchSet = searchMatchSetRef.current;
      if (matchSet && !matchSet.has(src) && !matchSet.has(tgt)) {
        return 'rgba(100, 116, 139, 0.08)';
      }
      return 'rgba(148, 163, 184, 0.28)';
    }, []);

    const getLinkWidth = useCallback((rawLink: object) => {
      const link = rawLink as FGLink;
      const src = typeof link.source === 'string' ? link.source : link.source.id;
      const tgt = typeof link.target === 'string' ? link.target : link.target.id;
      const selEdge = selectedEdgeRef.current;
      if (selEdge && selEdge.source === src && selEdge.target === tgt) {
        return 2.6;
      }
      const hovDoi = hoveredDoiRef.current;
      if (hovDoi && (src === hovDoi || tgt === hovDoi)) {
        return 1.8;
      }
      return 1;
    }, []);

    const handleNodeHover = useCallback((raw: object | null) => {
      const node = (raw as FGNode | null) ?? null;
      hoveredDoiRef.current = node?.doi ?? null;
      setHoveredNode(node);
    }, []);

    // Update tooltip position directly via DOM transform for zero React re-renders on mousemove
    const handleMouseMove = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const x = Math.min(e.clientX - rect.left + 16, Math.max(12, dimensions.width - 336));
        const y = Math.min(e.clientY - rect.top + 16, Math.max(12, dimensions.height - 200));
        lastMouseRef.current = { x, y };
        const tooltip = tooltipRef.current;
        if (tooltip && hoveredDoiRef.current) {
          tooltip.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        }
      },
      [dimensions.width, dimensions.height]
    );

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingFile(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingFile(false);
    };

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingFile(false);
      const file = e.dataTransfer.files?.[0];
      if (file) {
        onDropFile(file);
      }
    };

    return (
      <div
        ref={containerRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onMouseMove={handleMouseMove}
        className="relative flex-1 w-full h-full bg-slate-950 overflow-hidden select-none"
      >
        {nodes.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center pointer-events-none">
            <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-4 shadow-xl">
              <GitFork className="w-8 h-8 text-sky-400" />
            </div>
            <h2 className="text-lg font-semibold text-slate-200">
              Visualisasi Jaringan Sitasi DOI
            </h2>
            <p className="text-sm text-slate-400 max-w-md mt-2 leading-relaxed">
              Masukkan satu atau beberapa DOI di panel kiri untuk memulai crawl BFS, atau{' '}
              <strong className="text-sky-300">drag & drop</strong> file{' '}
              <code>.json</code> / <code>.json.gz</code> ke area ini untuk memuat graph secara
              instan.
            </p>
          </div>
        ) : (
          <ForceGraph2D
            ref={fgRef}
            width={dimensions.width}
            height={dimensions.height}
            graphData={graphData}
            backgroundColor="#020617"
            nodeId="id"
            nodeCanvasObject={drawNode}
            nodePointerAreaPaint={nodePointerAreaPaint}
            linkColor={getLinkColor}
            linkWidth={getLinkWidth}
            linkDirectionalArrowLength={isLargeGraph ? 0 : 4.5}
            linkDirectionalArrowRelPos={1}
            linkCurvature={isLargeGraph ? 0 : 0.08}
            cooldownTicks={isPaused ? 0 : isLargeGraph ? 100 : 160}
            d3AlphaDecay={isLargeGraph ? 0.045 : 0.025}
            d3VelocityDecay={isLargeGraph ? 0.38 : 0.32}
            onEngineStop={snapshotPositions}
            onNodeHover={handleNodeHover}
            onNodeClick={(raw) => {
              const n = raw as FGNode;
              onSelectEdge(null);
              onSelectNode(n);
            }}
            onLinkClick={(rawLink) => {
              const link = rawLink as FGLink;
              const src = typeof link.source === 'string' ? link.source : link.source.id;
              const tgt = typeof link.target === 'string' ? link.target : link.target.id;
              onSelectNode(null);
              onSelectEdge({ source: src, target: tgt });
            }}
            onBackgroundClick={() => {
              onSelectNode(null);
              onSelectEdge(null);
            }}
          />
        )}

        {/* Rich Hover Tooltip Card (positioned via GPU transform without React re-render) */}
        {hoveredNode && (
          <div
            ref={tooltipRef}
            className="pointer-events-none absolute top-0 left-0 z-30 w-80 rounded-xl bg-slate-900/95 backdrop-blur-md border border-slate-700/90 shadow-2xl p-3 text-xs space-y-1.5 will-change-transform"
            style={{
              transform: `translate3d(${lastMouseRef.current.x}px, ${lastMouseRef.current.y}px, 0)`,
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 font-mono font-bold">
                Rank #{hoveredNode.rank}
              </span>
              <span className="font-mono text-amber-300 font-semibold">
                PageRank {(hoveredNode.pagerank * 100).toFixed(3)}%
              </span>
            </div>

            <p className="font-semibold text-slate-100 leading-snug line-clamp-3">
              {hoveredNode.title}
            </p>
            <p className="font-mono text-[11px] text-sky-400 truncate">{hoveredNode.doi}</p>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-300 pt-1 border-t border-slate-800">
              <span>Tahun: {hoveredNode.year ?? '—'}</span>
              <span className="truncate max-w-[180px]">
                Jurnal: {hoveredNode.journal ?? '—'}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-0.5">
              <span>In-Degree: {hoveredNode.in_degree}</span>
              <span>Out-Degree: {hoveredNode.out_degree}</span>
              <span>Depth: {hoveredNode.depth}</span>
            </div>
          </div>
        )}

        {/* Color Legend Overlay */}
        {nodes.length > 0 && legend.length > 0 && (
          <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-lg bg-slate-900/85 backdrop-blur border border-slate-800 px-3 py-2 text-[11px] space-y-1 max-w-xs">
            <div className="font-semibold text-slate-300 uppercase tracking-wider text-[10px]">
              Legenda ({colorMode})
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {legend.map((item) => (
                <div key={item.label} className="flex items-center gap-1.5 text-slate-300">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Adaptive LOD indicator for large graphs */}
        {isLargeGraph && (
          <div
            className="pointer-events-none absolute bottom-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-lg bg-slate-900/85 backdrop-blur border border-emerald-500/30 px-2.5 py-1 text-[11px] text-emerald-300"
            title="Garis lurus & skip border saat zoom-out aktif otomatis untuk menjaga 60fps"
          >
            <Zap className="w-3 h-3" />
            <span>Adaptive LOD Aktif ({graphData.nodes.length} node)</span>
          </div>
        )}

        {/* Drag & Drop Overlay */}
        {isDraggingFile && (
          <div className="absolute inset-0 z-40 bg-sky-950/80 backdrop-blur-sm border-2 border-dashed border-sky-400 flex flex-col items-center justify-center text-center p-6">
            <UploadCloud className="w-12 h-12 text-sky-300 mb-3 animate-bounce" />
            <p className="text-base font-semibold text-white">
              Lepaskan file .json atau .json.gz di sini
            </p>
            <p className="text-xs text-sky-200 mt-1">
              Visualisasi akan dimuat ulang secara instan 100% di sisi client
            </p>
          </div>
        )}
      </div>
    );
  }
);

GraphCanvas.displayName = 'GraphCanvas';
