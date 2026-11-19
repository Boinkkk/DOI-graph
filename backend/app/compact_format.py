"""Compact indexed v2 JSON serialization and zlib/gzip compression helpers."""

from __future__ import annotations

import gzip
import json
import zlib
from typing import Any

from .models import GraphEdge, GraphPayload, GraphStats, PaperNode

COMPACT_FORMAT_VERSION = 2


def to_compact_v2(payload: GraphPayload) -> dict[str, Any]:
    """Convert a GraphPayload into portable compact v2 indexed JSON.

    Nodes are stored in an array and edges are stored as [sourceIdx, targetIdx] integer pairs
    to drastically reduce serialized size on large citation networks.
    """
    doi_to_idx: dict[str, int] = {}
    compact_nodes: list[dict[str, Any]] = []

    for idx, node in enumerate(payload.nodes):
        doi_to_idx[node.doi] = idx
        entry: dict[str, Any] = {
            "d": node.doi,
            "t": node.title,
            "a": node.authors,
            "y": node.year,
            "j": node.journal,
            "c": node.citation_count,
            "oa": 1 if node.is_oa else 0,
            "u": node.oa_url,
            "dp": node.depth,
            "s": 1 if node.is_seed else 0,
            "src": node.source_api,
            "pr": round(node.pagerank, 10),
            "r": node.rank,
            "in": node.in_degree,
            "out": node.out_degree,
        }
        compact_nodes.append(entry)

    compact_edges: list[list[int]] = []
    seen: set[tuple[int, int]] = set()
    for edge in payload.edges:
        s_idx = doi_to_idx.get(edge.source)
        t_idx = doi_to_idx.get(edge.target)
        if s_idx is None or t_idx is None:
            continue
        if (s_idx, t_idx) in seen:
            continue
        seen.add((s_idx, t_idx))
        compact_edges.append([s_idx, t_idx])

    return {
        "v": COMPACT_FORMAT_VERSION,
        "meta": {
            "seeds": payload.stats.seeds,
            "direction": payload.stats.direction,
            "max_depth": payload.stats.max_depth_reached,
            "cancelled": payload.stats.cancelled,
        },
        "nodes": compact_nodes,
        "edges": compact_edges,
    }


def from_compact_v2(data: dict[str, Any]) -> GraphPayload:
    """Restore a GraphPayload from compact v2 indexed JSON (or full v1 JSON)."""
    if data.get("v") == COMPACT_FORMAT_VERSION:
        raw_nodes = data.get("nodes", [])
        nodes: list[PaperNode] = []
        for item in raw_nodes:
            nodes.append(
                PaperNode(
                    doi=item["d"],
                    title=item.get("t", "Untitled Paper"),
                    authors=item.get("a", []),
                    year=item.get("y"),
                    journal=item.get("j"),
                    citation_count=item.get("c", 0),
                    is_oa=bool(item.get("oa", 0)),
                    oa_url=item.get("u"),
                    depth=item.get("dp", 0),
                    is_seed=bool(item.get("s", 0)),
                    source_api=item.get("src", "openalex"),
                    pagerank=item.get("pr", 0.0),
                    rank=item.get("r", 0),
                    in_degree=item.get("in", 0),
                    out_degree=item.get("out", 0),
                )
            )

        edges: list[GraphEdge] = []
        for pair in data.get("edges", []):
            if isinstance(pair, (list, tuple)) and len(pair) == 2:
                s_idx, t_idx = int(pair[0]), int(pair[1])
                if 0 <= s_idx < len(nodes) and 0 <= t_idx < len(nodes):
                    edges.append(GraphEdge(source=nodes[s_idx].doi, target=nodes[t_idx].doi))

        meta = data.get("meta", {})
        max_depth = max((n.depth for n in nodes), default=0)
        stats = GraphStats(
            total_nodes=len(nodes),
            total_edges=len(edges),
            max_depth_reached=meta.get("max_depth", max_depth),
            direction=meta.get("direction", "both"),
            seeds=meta.get("seeds", [n.doi for n in nodes if n.is_seed]),
            cancelled=bool(meta.get("cancelled", False)),
        )
        return GraphPayload(nodes=nodes, edges=edges, stats=stats)

    # Fallback: full v1 GraphPayload dict
    return GraphPayload.model_validate(data)


def compress_zlib(payload: GraphPayload) -> bytes:
    """Serialize GraphPayload to compact v2 JSON and compress with zlib."""
    compact = to_compact_v2(payload)
    raw = json.dumps(compact, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return zlib.compress(raw, level=6)


def decompress_zlib(blob: bytes) -> GraphPayload:
    """Decompress zlib blob and deserialize GraphPayload."""
    raw = zlib.decompress(blob)
    data = json.loads(raw.decode("utf-8"))
    return from_compact_v2(data)


def compress_gzip(payload: GraphPayload) -> bytes:
    """Serialize GraphPayload to compact v2 JSON and compress as .json.gz."""
    compact = to_compact_v2(payload)
    raw = json.dumps(compact, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return gzip.compress(raw, compresslevel=6)
