import type {
  CompactV2Node,
  CompactV2Payload,
  GraphEdge,
  GraphPayload,
  PaperNode,
} from '../types/graph';
import { normalizeDoi } from './doi';
import { computePageRankAndDegrees } from './pagerank';

export function toCompactV2(payload: GraphPayload): CompactV2Payload {
  const doiToIdx = new Map<string, number>();
  const nodes: CompactV2Node[] = payload.nodes.map((n, idx) => {
    doiToIdx.set(n.doi, idx);
    return {
      d: n.doi,
      t: n.title,
      a: n.authors,
      y: n.year,
      j: n.journal,
      c: n.citation_count,
      oa: n.is_oa ? 1 : 0,
      u: n.oa_url,
      dp: n.depth,
      s: n.is_seed ? 1 : 0,
      src: n.source_api,
      pr: Number(n.pagerank.toFixed(10)),
      r: n.rank,
      in: n.in_degree,
      out: n.out_degree,
    };
  });

  const edges: [number, number][] = [];
  const seen = new Set<string>();
  for (const edge of payload.edges) {
    const sIdx = doiToIdx.get(edge.source);
    const tIdx = doiToIdx.get(edge.target);
    if (sIdx === undefined || tIdx === undefined || sIdx === tIdx) continue;
    const key = `${sIdx}:${tIdx}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push([sIdx, tIdx]);
  }

  return {
    v: 2,
    meta: {
      seeds: payload.stats.seeds,
      direction: payload.stats.direction,
      max_depth: payload.stats.max_depth_reached,
      cancelled: payload.stats.cancelled,
    },
    nodes,
    edges,
  };
}

export function fromCompactOrLegacyJson(raw: unknown): GraphPayload {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Format JSON tidak valid.');
  }

  const obj = raw as Record<string, unknown>;

  if (obj.v === 2 && Array.isArray(obj.nodes) && Array.isArray(obj.edges)) {
    const v2 = obj as unknown as CompactV2Payload;
    const nodes: PaperNode[] = v2.nodes.map((item) => ({
      doi: normalizeDoi(item.d) ?? String(item.d).toLowerCase(),
      title: item.t || 'Untitled Paper',
      authors: Array.isArray(item.a) ? item.a : [],
      year: typeof item.y === 'number' ? item.y : null,
      journal: item.j ?? null,
      citation_count: Number(item.c ?? 0),
      is_oa: Boolean(item.oa),
      oa_url: item.u ?? null,
      depth: Number(item.dp ?? 0),
      is_seed: Boolean(item.s),
      source_api: item.src || 'uploaded',
      pagerank: Number(item.pr ?? 0),
      rank: Number(item.r ?? 0),
      in_degree: Number(item.in ?? 0),
      out_degree: Number(item.out ?? 0),
    }));

    const edges: GraphEdge[] = [];
    for (const pair of v2.edges) {
      if (Array.isArray(pair) && pair.length === 2) {
        const sNode = nodes[Number(pair[0])];
        const tNode = nodes[Number(pair[1])];
        if (sNode && tNode) {
          edges.push({ source: sNode.doi, target: tNode.doi });
        }
      }
    }

    const rankedNodes = computePageRankAndDegrees(nodes, edges, 0.85);
    const maxDepth = rankedNodes.reduce((acc, n) => Math.max(acc, n.depth), 0);
    return {
      nodes: rankedNodes,
      edges,
      stats: {
        total_nodes: rankedNodes.length,
        total_edges: edges.length,
        max_depth_reached: v2.meta?.max_depth ?? maxDepth,
        direction: v2.meta?.direction ?? 'both',
        seeds: v2.meta?.seeds ?? rankedNodes.filter((n) => n.is_seed).map((n) => n.doi),
        cancelled: Boolean(v2.meta?.cancelled),
      },
    };
  }

  // Legacy/v1 full GraphPayload
  if (Array.isArray(obj.nodes) && Array.isArray(obj.edges)) {
    const rawNodes = obj.nodes as Partial<PaperNode>[];
    const nodes: PaperNode[] = rawNodes
      .filter((n) => Boolean(n.doi))
      .map((n) => ({
        doi: normalizeDoi(n.doi) ?? String(n.doi).toLowerCase(),
        title: n.title || 'Untitled Paper',
        authors: Array.isArray(n.authors) ? n.authors : [],
        year: typeof n.year === 'number' ? n.year : null,
        journal: n.journal ?? null,
        citation_count: Number(n.citation_count ?? 0),
        is_oa: Boolean(n.is_oa),
        oa_url: n.oa_url ?? null,
        depth: Number(n.depth ?? 0),
        is_seed: Boolean(n.is_seed),
        source_api: n.source_api || 'uploaded',
        pagerank: Number(n.pagerank ?? 0),
        rank: Number(n.rank ?? 0),
        in_degree: Number(n.in_degree ?? 0),
        out_degree: Number(n.out_degree ?? 0),
      }));

    const edges: GraphEdge[] = (obj.edges as Partial<GraphEdge>[])
      .filter((e) => Boolean(e.source && e.target))
      .map((e) => ({
        source: normalizeDoi(String(e.source)) ?? String(e.source).toLowerCase(),
        target: normalizeDoi(String(e.target)) ?? String(e.target).toLowerCase(),
      }));

    const rankedNodes = computePageRankAndDegrees(nodes, edges, 0.85);
    const maxDepth = rankedNodes.reduce((acc, n) => Math.max(acc, n.depth), 0);
    const rawStats = (obj.stats as Record<string, unknown> | undefined) ?? {};
    return {
      nodes: rankedNodes,
      edges,
      stats: {
        total_nodes: rankedNodes.length,
        total_edges: edges.length,
        max_depth_reached:
          typeof rawStats.max_depth_reached === 'number' ? rawStats.max_depth_reached : maxDepth,
        direction: typeof rawStats.direction === 'string' ? rawStats.direction : 'both',
        seeds: Array.isArray(rawStats.seeds)
          ? (rawStats.seeds as string[])
          : rankedNodes.filter((n) => n.is_seed).map((n) => n.doi),
        cancelled: Boolean(rawStats.cancelled),
      },
    };
  }

  throw new Error('Struktur JSON tidak dikenali sebagai data DOI-Graph.');
}

async function gzipCompressBytes(input: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') {
    throw new Error('Browser tidak mendukung CompressionStream gzip.');
  }
  const copy = new Uint8Array(input.byteLength);
  copy.set(input);
  const cs = new CompressionStream('gzip');
  const stream = new Blob([copy]).stream().pipeThrough(cs);
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function gzipDecompressBytes(input: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Browser tidak mendukung DecompressionStream gzip.');
  }
  const copy = new Uint8Array(input.byteLength);
  copy.set(input);
  const ds = new DecompressionStream('gzip');
  const stream = new Blob([copy]).stream().pipeThrough(ds);
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportCompactJsonGz(payload: GraphPayload): Promise<void> {
  const compact = toCompactV2(payload);
  const jsonBytes = new TextEncoder().encode(JSON.stringify(compact));
  const gzBytes = await gzipCompressBytes(jsonBytes);
  const copy = new Uint8Array(gzBytes.byteLength);
  copy.set(gzBytes);
  const blob = new Blob([copy], { type: 'application/gzip' });
  const stamp = new Date().toISOString().slice(0, 10);
  triggerDownload(blob, `doi-graph-${stamp}.json.gz`);
}

export function exportCompactJson(payload: GraphPayload): void {
  const compact = toCompactV2(payload);
  const blob = new Blob([JSON.stringify(compact, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const stamp = new Date().toISOString().slice(0, 10);
  triggerDownload(blob, `doi-graph-${stamp}.json`);
}

function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportRankingCsv(nodes: PaperNode[]): void {
  const sorted = [...nodes].sort((a, b) => a.rank - b.rank);
  const headers = [
    'Rank',
    'DOI',
    'Title',
    'Authors',
    'Year',
    'Journal',
    'PageRank_Pct',
    'In_Degree',
    'Out_Degree',
    'Citation_Count',
    'Depth',
    'Is_Seed',
    'Open_Access',
    'OA_URL',
  ];
  const rows = sorted.map((n) =>
    [
      n.rank,
      n.doi,
      n.title,
      n.authors.join('; '),
      n.year ?? '',
      n.journal ?? '',
      (n.pagerank * 100).toFixed(4),
      n.in_degree,
      n.out_degree,
      n.citation_count,
      n.depth,
      n.is_seed ? 'true' : 'false',
      n.is_oa ? 'true' : 'false',
      n.oa_url ?? '',
    ]
      .map(escapeCsvCell)
      .join(',')
  );

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const stamp = new Date().toISOString().slice(0, 10);
  triggerDownload(blob, `doi-graph-ranking-${stamp}.csv`);
}

export async function importGraphFile(file: File): Promise<GraphPayload> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const isGzipMagic = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  const isGzExt = file.name.toLowerCase().endsWith('.gz');

  let text: string;
  if (isGzipMagic || isGzExt) {
    const decompressed = await gzipDecompressBytes(bytes);
    text = new TextDecoder().decode(decompressed);
  } else {
    text = new TextDecoder().decode(bytes);
  }

  const parsed = JSON.parse(text) as unknown;
  return fromCompactOrLegacyJson(parsed);
}
