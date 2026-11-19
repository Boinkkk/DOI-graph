"""Unit tests for compact v2 format and zlib/gzip compression."""

import gzip
import json

from app.compact_format import (
    COMPACT_FORMAT_VERSION,
    compress_gzip,
    compress_zlib,
    decompress_zlib,
    from_compact_v2,
    to_compact_v2,
)
from app.models import GraphEdge, GraphPayload, GraphStats, PaperNode


def _sample_payload() -> GraphPayload:
    nodes = [
        PaperNode(
            doi="10.1000/seed",
            title="Seed Paper",
            authors=["Alice Smith", "Bob Jones"],
            year=2023,
            journal="Nature",
            citation_count=42,
            is_oa=True,
            oa_url="https://example.org/seed.pdf",
            depth=0,
            is_seed=True,
            pagerank=0.65,
            rank=1,
            in_degree=1,
            out_degree=0,
        ),
        PaperNode(
            doi="10.1000/citing",
            title="Citing Paper",
            authors=["Carol Lee"],
            year=2024,
            journal="Science",
            citation_count=5,
            is_oa=False,
            depth=1,
            is_seed=False,
            pagerank=0.35,
            rank=2,
            in_degree=0,
            out_degree=1,
        ),
    ]
    edges = [GraphEdge(source="10.1000/citing", target="10.1000/seed")]
    stats = GraphStats(
        total_nodes=2,
        total_edges=1,
        max_depth_reached=1,
        direction="both",
        seeds=["10.1000/seed"],
        cancelled=False,
    )
    return GraphPayload(nodes=nodes, edges=edges, stats=stats)


def test_compact_v2_uses_integer_edge_indices() -> None:
    payload = _sample_payload()
    compact = to_compact_v2(payload)
    assert compact["v"] == COMPACT_FORMAT_VERSION
    assert compact["edges"] == [[1, 0]]

    restored = from_compact_v2(compact)
    assert len(restored.nodes) == 2
    assert restored.edges == payload.edges
    assert restored.nodes[0].title == "Seed Paper"
    assert restored.nodes[0].is_oa is True


def test_zlib_and_gzip_roundtrip() -> None:
    payload = _sample_payload()
    zblob = compress_zlib(payload)
    restored_z = decompress_zlib(zblob)
    assert restored_z.nodes[0].doi == "10.1000/seed"
    assert restored_z.edges[0].source == "10.1000/citing"

    gzblob = compress_gzip(payload)
    raw = json.loads(gzip.decompress(gzblob).decode("utf-8"))
    assert raw["v"] == 2
    assert raw["edges"] == [[1, 0]]
