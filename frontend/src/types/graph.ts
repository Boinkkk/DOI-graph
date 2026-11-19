export type CrawlDirection = 'references' | 'citations' | 'both';

export type NodeSizeMode = 'pagerank' | 'in_degree' | 'uniform';
export type ColorMode = 'depth' | 'year' | 'journal' | 'oa';
export type CenterMode = 'seed' | 'top_pagerank';

export interface PaperNode {
  doi: string;
  title: string;
  authors: string[];
  year: number | null;
  journal: string | null;
  citation_count: number;
  is_oa: boolean;
  oa_url: string | null;
  depth: number;
  is_seed: boolean;
  source_api: string;
  pagerank: number;
  rank: number;
  in_degree: number;
  out_degree: number;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphStats {
  total_nodes: number;
  total_edges: number;
  max_depth_reached: number;
  direction: string;
  seeds: string[];
  cancelled: boolean;
}

export interface GraphPayload {
  nodes: PaperNode[];
  edges: GraphEdge[];
  stats: GraphStats;
}

export interface HistorySummary {
  id: string;
  title: string;
  seeds: string[];
  direction: string;
  max_depth: number;
  max_papers: number;
  node_count: number;
  edge_count: number;
  cancelled: boolean;
  compressed_bytes: number;
  created_at: string;
}

export interface CrawlConfig {
  seedsRaw: string;
  maxDepth: number;
  maxPapers: number;
  direction: CrawlDirection;
}

export interface CompactV2Node {
  d: string;
  t: string;
  a: string[];
  y: number | null;
  j: string | null;
  c: number;
  oa: number;
  u: string | null;
  dp: number;
  s: number;
  src: string;
  pr: number;
  r: number;
  in: number;
  out: number;
}

export interface CompactV2Payload {
  v: 2;
  meta: {
    seeds: string[];
    direction: string;
    max_depth: number;
    cancelled: boolean;
  };
  nodes: CompactV2Node[];
  edges: [number, number][];
}

export interface CrawlProgress {
  nodes: number;
  edges: number;
  depth: number;
  queued: number;
  message: string;
}
