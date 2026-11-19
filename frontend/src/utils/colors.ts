import type { ColorMode, PaperNode } from '../types/graph';

const DEPTH_PALETTE = [
  '#f59e0b', // depth 0 (seed): warm amber
  '#38bdf8', // depth 1: sky cyan
  '#818cf8', // depth 2: indigo
  '#c084fc', // depth 3: purple
  '#f472b6', // depth 4: pink
  '#2dd4bf', // depth 5+: teal
];

const CATEGORICAL_PALETTE = [
  '#38bdf8',
  '#34d399',
  '#f59e0b',
  '#f472b6',
  '#a78bfa',
  '#fb7185',
  '#2dd4bf',
  '#60a5fa',
  '#facc15',
  '#fb923c',
];

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function getNodeColor(
  node: PaperNode,
  mode: ColorMode,
  yearRange: [number, number]
): string {
  switch (mode) {
    case 'depth': {
      const idx = Math.min(Math.max(0, node.depth), DEPTH_PALETTE.length - 1);
      return DEPTH_PALETTE[idx];
    }
    case 'oa': {
      return node.is_oa ? '#10b981' : '#64748b';
    }
    case 'journal': {
      if (!node.journal) return '#475569';
      const idx = hashString(node.journal.toLowerCase()) % CATEGORICAL_PALETTE.length;
      return CATEGORICAL_PALETTE[idx];
    }
    case 'year': {
      if (!node.year) return '#475569';
      const [minY, maxY] = yearRange;
      const span = Math.max(1, maxY - minY);
      const t = Math.min(1, Math.max(0, (node.year - minY) / span));
      // Interpolate from cool indigo (#6366f1) -> cyan (#06b6d4) -> bright emerald (#10b981) -> amber (#f59e0b)
      const hue = 240 - t * 195; // 240 (blue) -> 45 (amber)
      return `hsl(${Math.round(hue)}, 82%, 58%)`;
    }
  }
}

export interface LegendEntry {
  label: string;
  color: string;
}

export function buildColorLegend(
  nodes: PaperNode[],
  mode: ColorMode,
  yearRange: [number, number]
): LegendEntry[] {
  if (mode === 'depth') {
    const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 0);
    const items: LegendEntry[] = [];
    const cap = Math.min(maxDepth, DEPTH_PALETTE.length - 1);
    for (let d = 0; d <= cap; d++) {
      items.push({
        label: d === 0 ? 'Depth 0 (Seed)' : d === DEPTH_PALETTE.length - 1 && maxDepth >= d ? `Depth ${d}+` : `Depth ${d}`,
        color: DEPTH_PALETTE[d],
      });
    }
    return items;
  }

  if (mode === 'oa') {
    return [
      { label: 'Open Access', color: '#10b981' },
      { label: 'Closed / Unknown', color: '#64748b' },
    ];
  }

  if (mode === 'year') {
    const [minY, maxY] = yearRange;
    return [
      { label: `${minY} (Older)`, color: 'hsl(240, 82%, 58%)' },
      { label: `${Math.round((minY + maxY) / 2)}`, color: 'hsl(142, 82%, 58%)' },
      { label: `${maxY} (Newer)`, color: 'hsl(45, 82%, 58%)' },
      { label: 'Unknown Year', color: '#475569' },
    ];
  }

  // journal: top 6 journals by frequency
  const counts = new Map<string, number>();
  for (const n of nodes) {
    if (!n.journal) continue;
    counts.set(n.journal, (counts.get(n.journal) ?? 0) + 1);
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([j]) => ({
      label: j.length > 26 ? `${j.slice(0, 24)}…` : j,
      color: CATEGORICAL_PALETTE[hashString(j.toLowerCase()) % CATEGORICAL_PALETTE.length],
    }));
  if (nodes.some((n) => !n.journal)) {
    top.push({ label: 'Unknown Venue', color: '#475569' });
  }
  return top;
}
