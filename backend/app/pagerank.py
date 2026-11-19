"""Directed PageRank and graph degree computation."""

from __future__ import annotations

from collections import defaultdict

from .models import GraphEdge, PaperNode


def compute_pagerank_and_degrees(
    nodes: list[PaperNode],
    edges: list[GraphEdge],
    damping: float = 0.85,
    max_iter: int = 100,
    tol: float = 1e-8,
) -> list[PaperNode]:
    """Compute directed PageRank (damping=0.85), in/out degrees, and Rank #1..N.

    Edge (u -> v) represents that paper `u` cites paper `v`.
    Authority flows along directed edges from citing paper `u` to cited paper `v`.
    Dangling nodes distribute their rank uniformly across all nodes.
    """
    n = len(nodes)
    if n == 0:
        return nodes

    doi_to_idx: dict[str, int] = {node.doi: i for i, node in enumerate(nodes)}
    outgoing: list[list[int]] = [[] for _ in range(n)]
    in_deg = [0] * n
    out_deg = [0] * n

    seen_edges: set[tuple[int, int]] = set()
    for edge in edges:
        u = doi_to_idx.get(edge.source)
        v = doi_to_idx.get(edge.target)
        if u is None or v is None or u == v:
            continue
        if (u, v) in seen_edges:
            continue
        seen_edges.add((u, v))
        outgoing[u].append(v)
        out_deg[u] += 1
        in_deg[v] += 1

    ranks = [1.0 / n] * n
    base = (1.0 - damping) / n
    dangling_indices = [i for i in range(n) if out_deg[i] == 0]

    for _ in range(max_iter):
        new_ranks = [base] * n
        dangling_sum = sum(ranks[i] for i in dangling_indices)
        dangling_contrib = damping * dangling_sum / n
        for j in range(n):
            new_ranks[j] += dangling_contrib

        for i in range(n):
            deg = out_deg[i]
            if deg > 0:
                share = damping * ranks[i] / deg
                for target in outgoing[i]:
                    new_ranks[target] += share

        # Normalize to eliminate floating point drift
        total = sum(new_ranks)
        if total > 0:
            inv_total = 1.0 / total
            new_ranks = [r * inv_total for r in new_ranks]

        diff = sum(abs(new_ranks[i] - ranks[i]) for i in range(n))
        ranks = new_ranks
        if diff < tol:
            break

    for i, node in enumerate(nodes):
        node.pagerank = ranks[i]
        node.in_degree = in_deg[i]
        node.out_degree = out_deg[i]

    # Deterministic ordering: highest PageRank, then highest in-degree, then DOI ascending
    ordered_indices = sorted(
        range(n),
        key=lambda i: (-nodes[i].pagerank, -nodes[i].in_degree, nodes[i].doi),
    )
    for rank_pos, idx in enumerate(ordered_indices, start=1):
        nodes[idx].rank = rank_pos

    return nodes
