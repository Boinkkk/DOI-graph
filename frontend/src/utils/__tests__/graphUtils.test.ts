import { describe, expect, it } from 'vitest';
import { normalizeDoi, parseSeedDois } from '../doi';
import { computePageRankAndDegrees } from '../pagerank';
import { fromCompactOrLegacyJson, toCompactV2 } from '../compactCodec';
import type { GraphEdge, GraphPayload, PaperNode } from '../../types/graph';

describe('DOI normalization', () => {
  it('normalizes URLs, prefixes, and deduplicates seeds', () => {
    expect(normalizeDoi('https://doi.org/10.1038/S41586-021-03819-2')).toBe(
      '10.1038/s41586-021-03819-2'
    );
    expect(parseSeedDois('https://doi.org/10.1038/a1, 10.1038/A1\n10.1126/b2')).toEqual([
      '10.1038/a1',
      '10.1126/b2',
    ]);
  });
});

describe('Client-side PageRank', () => {
  it('ranks cited target highest with damping=0.85', () => {
    const nodes: PaperNode[] = [
      {
        doi: '10.1001/a',
        title: 'A',
        authors: [],
        year: 2022,
        journal: null,
        citation_count: 0,
        is_oa: false,
        oa_url: null,
        depth: 0,
        is_seed: true,
        source_api: 'openalex',
        pagerank: 0,
        rank: 0,
        in_degree: 0,
        out_degree: 0,
      },
      {
        doi: '10.1001/b',
        title: 'B',
        authors: [],
        year: 2020,
        journal: null,
        citation_count: 10,
        is_oa: true,
        oa_url: null,
        depth: 1,
        is_seed: false,
        source_api: 'openalex',
        pagerank: 0,
        rank: 0,
        in_degree: 0,
        out_degree: 0,
      },
      {
        doi: '10.1001/c',
        title: 'C',
        authors: [],
        year: 2023,
        journal: null,
        citation_count: 0,
        is_oa: false,
        oa_url: null,
        depth: 1,
        is_seed: false,
        source_api: 'openalex',
        pagerank: 0,
        rank: 0,
        in_degree: 0,
        out_degree: 0,
      },
    ];
    const edges: GraphEdge[] = [
      { source: '10.1001/a', target: '10.1001/b' },
      { source: '10.1001/c', target: '10.1001/b' },
    ];

    const ranked = computePageRankAndDegrees(nodes, edges, 0.85);
    const byDoi = Object.fromEntries(ranked.map((n) => [n.doi, n]));
    expect(byDoi['10.1001/b'].rank).toBe(1);
    expect(byDoi['10.1001/b'].in_degree).toBe(2);
    const sum = ranked.reduce((acc, n) => acc + n.pagerank, 0);
    expect(sum).toBeCloseTo(1, 6);
  });
});

describe('Compact v2 Codec', () => {
  it('round-trips indexed edges cleanly', () => {
    const payload: GraphPayload = {
      nodes: [
        {
          doi: '10.1001/seed',
          title: 'Seed',
          authors: ['Alice'],
          year: 2021,
          journal: 'Nature',
          citation_count: 5,
          is_oa: true,
          oa_url: 'https://oa.test/1.pdf',
          depth: 0,
          is_seed: true,
          source_api: 'openalex',
          pagerank: 0.5,
          rank: 1,
          in_degree: 1,
          out_degree: 0,
        },
        {
          doi: '10.1001/cite',
          title: 'Citer',
          authors: ['Bob'],
          year: 2024,
          journal: 'Science',
          citation_count: 1,
          is_oa: false,
          oa_url: null,
          depth: 1,
          is_seed: false,
          source_api: 'openalex',
          pagerank: 0.5,
          rank: 2,
          in_degree: 0,
          out_degree: 1,
        },
      ],
      edges: [{ source: '10.1001/cite', target: '10.1001/seed' }],
      stats: {
        total_nodes: 2,
        total_edges: 1,
        max_depth_reached: 1,
        direction: 'both',
        seeds: ['10.1001/seed'],
        cancelled: false,
      },
    };

    const compact = toCompactV2(payload);
    expect(compact.v).toBe(2);
    expect(compact.edges).toEqual([[1, 0]]);

    const restored = fromCompactOrLegacyJson(compact);
    expect(restored.nodes).toHaveLength(2);
    expect(restored.edges).toEqual([{ source: '10.1001/cite', target: '10.1001/seed' }]);
    expect(restored.nodes.find((n) => n.doi === '10.1001/seed')?.rank).toBe(1);
  });
});
