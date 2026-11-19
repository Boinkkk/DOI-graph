import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  cancelCrawl,
  deleteHistoryItem,
  fetchHistory,
  loadHistoryItem,
  startCrawlStream,
} from './api/client';
import { CrawlSidebar, type SidebarTab } from './components/CrawlSidebar';
import { EdgeInspector } from './components/EdgeInspector';
import { GraphCanvas, type GraphCanvasHandle } from './components/GraphCanvas';
import { GraphToolbar } from './components/GraphToolbar';
import { HeaderBar } from './components/HeaderBar';
import { PaperInspector } from './components/PaperInspector';
import type {
  CenterMode,
  ColorMode,
  CrawlConfig,
  CrawlProgress,
  GraphEdge,
  GraphPayload,
  GraphStats,
  HistorySummary,
  NodeSizeMode,
  PaperNode,
} from './types/graph';
import {
  exportCompactJson,
  exportCompactJsonGz,
  exportRankingCsv,
  importGraphFile,
} from './utils/compactCodec';
import { parseSeedDois } from './utils/doi';
import { computePageRankAndDegrees } from './utils/pagerank';

export function App(): React.ReactElement {
  const graphRef = useRef<GraphCanvasHandle>(null);

  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('crawl');
  const [config, setConfig] = useState<CrawlConfig>({
    seedsRaw: 'https://doi.org/10.1038/s41586-021-03819-2',
    maxDepth: 2,
    maxPapers: 150,
    direction: 'both',
  });

  const [nodes, setNodes] = useState<PaperNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [stats, setStats] = useState<GraphStats | null>(null);

  const [isCrawling, setIsCrawling] = useState(false);
  const [progress, setProgress] = useState<CrawlProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusText, setStatusText] = useState(
    'Siap memetakan jaringan sitasi DOI secara interaktif'
  );

  // Toolbar visualization state
  const [searchQuery, setSearchQuery] = useState('');
  const [depthRange, setDepthRange] = useState<[number, number]>([0, 10]);
  const [nodeSizeMode, setNodeSizeMode] = useState<NodeSizeMode>('pagerank');
  const [colorMode, setColorMode] = useState<ColorMode>('depth');
  const [centerMode, setCenterMode] = useState<CenterMode>('seed');
  const [isPaused, setIsPaused] = useState(false);

  // Selection state
  const [selectedDoi, setSelectedDoi] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);

  // History state
  const [historyItems, setHistoryItems] = useState<HistorySummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Streaming refs
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeCrawlIdRef = useRef<string | null>(null);
  const liveNodesRef = useRef<Map<string, PaperNode>>(new Map());
  const liveEdgesRef = useRef<GraphEdge[]>([]);
  const liveEdgeKeysRef = useRef<Set<string>>(new Set());
  const flushTimerRef = useRef<number | null>(null);

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const items = await fetchHistory();
      setHistoryItems(items);
    } catch {
      // Backend might not be running during pure client-side file inspection
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const maxAvailableDepth = useMemo(
    () => nodes.reduce((m, n) => Math.max(m, n.depth), 0),
    [nodes]
  );

  const selectedNode = useMemo(
    () => (selectedDoi ? nodes.find((n) => n.doi === selectedDoi) ?? null : null),
    [nodes, selectedDoi]
  );

  const applyGraphPayload = useCallback((payload: GraphPayload, label: string) => {
    const ranked = computePageRankAndDegrees(payload.nodes, payload.edges, 0.85);
    const maxD = ranked.reduce((m, n) => Math.max(m, n.depth), 0);
    setNodes(ranked);
    setEdges(payload.edges);
    setStats(payload.stats);
    setDepthRange([0, Math.max(maxD, payload.stats.max_depth_reached)]);
    setSelectedDoi(null);
    setSelectedEdge(null);
    setIsPaused(false);
    setStatusText(label);
    setTimeout(() => graphRef.current?.fitToScreen(), 350);
  }, []);

  const flushLiveGraph = useCallback(() => {
    flushTimerRef.current = null;
    const rawNodes = Array.from(liveNodesRef.current.values());
    const rawEdges = [...liveEdgesRef.current];
    // Use fewer PageRank iterations during live streaming; final complete event runs full 100 iters
    const ranked = computePageRankAndDegrees(rawNodes, rawEdges, 0.85, 25);
    const maxD = ranked.reduce((m, n) => Math.max(m, n.depth), 0);
    setNodes(ranked);
    setEdges(rawEdges);
    setDepthRange((prev) => [prev[0], Math.max(prev[1], maxD)]);
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current !== null) return;
    const count = liveNodesRef.current.size;
    const delay = count > 600 ? 900 : count > 150 ? 450 : 160;
    flushTimerRef.current = window.setTimeout(flushLiveGraph, delay);
  }, [flushLiveGraph]);

  const runCrawlWithConfig = useCallback(
    async (cfg: CrawlConfig) => {
      const seeds = parseSeedDois(cfg.seedsRaw);
      if (seeds.length === 0) {
        setErrorMsg('Masukkan minimal satu DOI atau link https://doi.org/... yang valid.');
        return;
      }

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      activeCrawlIdRef.current = null;

      liveNodesRef.current.clear();
      liveEdgesRef.current = [];
      liveEdgeKeysRef.current.clear();
      if (flushTimerRef.current !== null) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }

      setNodes([]);
      setEdges([]);
      setStats(null);
      setSelectedDoi(null);
      setSelectedEdge(null);
      setIsPaused(false);
      setErrorMsg(null);
      setIsCrawling(true);
      setDepthRange([0, cfg.maxDepth]);
      setProgress({
        nodes: 0,
        edges: 0,
        depth: 0,
        queued: seeds.length,
        message: 'Menghubungkan ke stream crawler...',
      });
      setStatusText(`Memulai crawl dari ${seeds.length} seed DOI...`);

      try {
        await startCrawlStream(
          {
            seeds,
            max_depth: cfg.maxDepth,
            max_papers: cfg.maxPapers,
            direction: cfg.direction,
          },
          {
            onStarted: (crawlId) => {
              activeCrawlIdRef.current = crawlId;
            },
            onStatus: (p) => {
              setProgress(p);
              setStatusText(p.message);
            },
            onNode: (node) => {
              liveNodesRef.current.set(node.doi, node);
              scheduleFlush();
            },
            onEdge: (edge) => {
              const key = `${edge.source}->${edge.target}`;
              if (!liveEdgeKeysRef.current.has(key)) {
                liveEdgeKeysRef.current.add(key);
                liveEdgesRef.current.push(edge);
                scheduleFlush();
              }
            },
            onProgress: (p) => {
              setProgress((prev) => ({
                ...p,
                message: prev?.message ?? `Depth ${p.depth}: ${p.nodes} paper, ${p.edges} sitasi`,
              }));
            },
            onComplete: (payload) => {
              if (flushTimerRef.current !== null) {
                clearTimeout(flushTimerRef.current);
                flushTimerRef.current = null;
              }
              const msg = payload.stats.cancelled
                ? `Crawl dihentikan (${payload.nodes.length} paper, ${payload.edges.length} sitasi tersimpan).`
                : `Crawl selesai: ${payload.nodes.length} paper, ${payload.edges.length} sitasi (auto-saved).`;
              applyGraphPayload(payload, msg);
              setProgress({
                nodes: payload.nodes.length,
                edges: payload.edges.length,
                depth: payload.stats.max_depth_reached,
                queued: 0,
                message: msg,
              });
              setIsCrawling(false);
              void refreshHistory();
            },
            onError: (msg) => {
              setErrorMsg(msg);
              setStatusText(`Error: ${msg}`);
              setIsCrawling(false);
            },
          },
          controller.signal
        );
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          const msg = err instanceof Error ? err.message : 'Gagal menjalankan crawl.';
          setErrorMsg(msg);
          setStatusText(`Error: ${msg}`);
        }
        setIsCrawling(false);
      } finally {
        activeCrawlIdRef.current = null;
      }
    },
    [applyGraphPayload, refreshHistory, scheduleFlush]
  );

  const handleStopCrawl = useCallback(() => {
    const cid = activeCrawlIdRef.current;
    if (cid) {
      void cancelCrawl(cid);
      setStatusText('Menghentikan crawl & menyimpan hasil parsial...');
      window.setTimeout(() => {
        if (activeCrawlIdRef.current === cid) {
          abortControllerRef.current?.abort();
          setIsCrawling(false);
        }
      }, 2500);
    } else {
      abortControllerRef.current?.abort();
      setIsCrawling(false);
    }
  }, []);

  const handleUploadOrDropFile = useCallback(
    async (file: File) => {
      try {
        setErrorMsg(null);
        const payload = await importGraphFile(file);
        applyGraphPayload(
          payload,
          `Dimuat instan dari ${file.name} (${payload.nodes.length} paper, ${payload.edges.length} sitasi)`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gagal membaca file graph.';
        setErrorMsg(msg);
        setStatusText(`Gagal memuat file: ${msg}`);
      }
    },
    [applyGraphPayload]
  );

  const handleLoadHistory = useCallback(
    async (id: string) => {
      try {
        setErrorMsg(null);
        const payload = await loadHistoryItem(id);
        applyGraphPayload(
          payload,
          `Dimuat dari riwayat (${payload.nodes.length} paper, ${payload.edges.length} sitasi)`
        );
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat riwayat.');
      }
    },
    [applyGraphPayload]
  );

  const handleDeleteHistory = useCallback(
    async (id: string) => {
      try {
        await deleteHistoryItem(id);
        setHistoryItems((prev) => prev.filter((item) => item.id !== id));
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Gagal menghapus riwayat.');
      }
    },
    []
  );

  const handleSelectNode = useCallback((node: PaperNode | null) => {
    setSelectedEdge(null);
    setSelectedDoi(node ? node.doi : null);
    if (node) {
      graphRef.current?.focusNode(node.doi);
    }
  }, []);

  const handleReseedAndCrawl = useCallback(
    (doi: string) => {
      const nextConfig: CrawlConfig = {
        ...config,
        seedsRaw: `https://doi.org/${doi}`,
      };
      setConfig(nextConfig);
      setSidebarTab('crawl');
      void runCrawlWithConfig(nextConfig);
    },
    [config, runCrawlWithConfig]
  );

  const currentPayload: GraphPayload = useMemo(
    () => ({
      nodes,
      edges,
      stats: stats ?? {
        total_nodes: nodes.length,
        total_edges: edges.length,
        max_depth_reached: maxAvailableDepth,
        direction: config.direction,
        seeds: parseSeedDois(config.seedsRaw),
        cancelled: false,
      },
    }),
    [nodes, edges, stats, maxAvailableDepth, config.direction, config.seedsRaw]
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      <HeaderBar
        nodeCount={nodes.length}
        edgeCount={edges.length}
        maxDepthReached={maxAvailableDepth}
        isCrawling={isCrawling}
        statusText={statusText}
        onUploadFile={(file) => void handleUploadOrDropFile(file)}
      />

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <CrawlSidebar
          activeTab={sidebarTab}
          onTabChange={setSidebarTab}
          config={config}
          isCrawling={isCrawling}
          progress={progress}
          errorMsg={errorMsg}
          onConfigChange={setConfig}
          onStartCrawl={() => void runCrawlWithConfig(config)}
          onStopCrawl={handleStopCrawl}
          nodes={nodes}
          selectedDoi={selectedDoi}
          onSelectNode={handleSelectNode}
          historyItems={historyItems}
          historyLoading={historyLoading}
          onRefreshHistory={() => void refreshHistory()}
          onLoadHistory={(id) => void handleLoadHistory(id)}
          onDeleteHistory={(id) => void handleDeleteHistory(id)}
        />

        <main className="flex-1 min-w-0 flex flex-col relative overflow-hidden">
          <GraphToolbar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            maxAvailableDepth={maxAvailableDepth}
            depthRange={depthRange}
            onDepthRangeChange={setDepthRange}
            nodeSizeMode={nodeSizeMode}
            onNodeSizeModeChange={setNodeSizeMode}
            colorMode={colorMode}
            onColorModeChange={setColorMode}
            centerMode={centerMode}
            onCenterModeChange={setCenterMode}
            isPaused={isPaused}
            onTogglePause={() => setIsPaused((p) => !p)}
            onFitScreen={() => graphRef.current?.fitToScreen()}
            onExportJsonGz={() => void exportCompactJsonGz(currentPayload)}
            onExportJson={() => exportCompactJson(currentPayload)}
            onExportCsv={() => exportRankingCsv(nodes)}
            onExportPng={() => graphRef.current?.exportPng()}
            hasData={nodes.length > 0}
          />

          <div className="flex-1 min-h-0 relative flex overflow-hidden">
            <GraphCanvas
              ref={graphRef}
              nodes={nodes}
              edges={edges}
              searchQuery={searchQuery}
              depthRange={depthRange}
              nodeSizeMode={nodeSizeMode}
              colorMode={colorMode}
              centerMode={centerMode}
              isPaused={isPaused}
              selectedDoi={selectedDoi}
              selectedEdge={selectedEdge}
              onSelectNode={(n) => {
                setSelectedEdge(null);
                setSelectedDoi(n ? n.doi : null);
              }}
              onSelectEdge={setSelectedEdge}
              onDropFile={(file) => void handleUploadOrDropFile(file)}
            />

            {selectedEdge && (
              <EdgeInspector
                edge={selectedEdge}
                nodes={nodes}
                onClose={() => setSelectedEdge(null)}
                onSelectNode={handleSelectNode}
              />
            )}
          </div>
        </main>

        {selectedNode && (
          <PaperInspector
            node={selectedNode}
            allNodes={nodes}
            edges={edges}
            onClose={() => setSelectedDoi(null)}
            onSelectNode={handleSelectNode}
            onReseedAndCrawl={handleReseedAndCrawl}
          />
        )}
      </div>
    </div>
  );
}

export default App;
