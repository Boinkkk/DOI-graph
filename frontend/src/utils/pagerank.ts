import type { GraphEdge, PaperNode } from '../types/graph';

/**
 * Compute directed PageRank (damping = 0.85), in/out degrees, and deterministic Rank #1..N.
 * Edge (u -> v) represents that paper `u` cites paper `v`.
 */
export function computePageRankAndDegrees(
  nodes: PaperNode[],
  edges: GraphEdge[],
  damping = 0.85,
  maxIter = 100,
  tol = 1e-8
): PaperNode[] {
  const n = nodes.length;
  if (n === 0) return [];

  const cloned: PaperNode[] = nodes.map((node) => ({ ...node }));
  const doiToIdx = new Map<string, number>();
  cloned.forEach((node, idx) => doiToIdx.set(node.doi, idx));

  const outgoing: number[][] = Array.from({ length: n }, () => []);
  const inDeg = new Int32Array(n);
  const outDeg = new Int32Array(n);
  const seenEdges = new Set<string>();

  for (const edge of edges) {
    const u = doiToIdx.get(edge.source);
    const v = doiToIdx.get(edge.target);
    if (u === undefined || v === undefined || u === v) continue;
    const key = `${u}:${v}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    outgoing[u].push(v);
    outDeg[u] += 1;
    inDeg[v] += 1;
  }

  let ranks = new Float64Array(n).fill(1 / n);
  const base = (1 - damping) / n;
  const danglingIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    if (outDeg[i] === 0) danglingIndices.push(i);
  }

  for (let iter = 0; iter < maxIter; iter++) {
    const newRanks = new Float64Array(n).fill(base);
    let danglingSum = 0;
    for (const i of danglingIndices) {
      danglingSum += ranks[i];
    }
    const danglingContrib = (damping * danglingSum) / n;
    if (danglingContrib > 0) {
      for (let j = 0; j < n; j++) {
        newRanks[j] += danglingContrib;
      }
    }

    for (let i = 0; i < n; i++) {
      const deg = outDeg[i];
      if (deg > 0) {
        const share = (damping * ranks[i]) / deg;
        const targets = outgoing[i];
        for (let k = 0; k < targets.length; k++) {
          newRanks[targets[k]] += share;
        }
      }
    }

    let total = 0;
    for (let i = 0; i < n; i++) total += newRanks[i];
    if (total > 0) {
      const inv = 1 / total;
      for (let i = 0; i < n; i++) newRanks[i] *= inv;
    }

    let diff = 0;
    for (let i = 0; i < n; i++) {
      diff += Math.abs(newRanks[i] - ranks[i]);
    }
    ranks = newRanks;
    if (diff < tol) break;
  }

  for (let i = 0; i < n; i++) {
    cloned[i].pagerank = ranks[i];
    cloned[i].in_degree = inDeg[i];
    cloned[i].out_degree = outDeg[i];
  }

  const ordered = Array.from({ length: n }, (_, i) => i).sort((a, b) => {
    const prDiff = cloned[b].pagerank - cloned[a].pagerank;
    if (Math.abs(prDiff) > 1e-15) return prDiff;
    const inDiff = cloned[b].in_degree - cloned[a].in_degree;
    if (inDiff !== 0) return inDiff;
    return cloned[a].doi.localeCompare(cloned[b].doi);
  });

  ordered.forEach((idx, pos) => {
    cloned[idx].rank = pos + 1;
  });

  return cloned;
}
