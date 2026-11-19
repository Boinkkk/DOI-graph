"""Unit tests for directed PageRank and degree calculation."""

import math

from app.models import GraphEdge, PaperNode
from app.pagerank import compute_pagerank_and_degrees


def test_pagerank_directed_authority_and_mass() -> None:
    # A -> B, C -> B, D -> B (B is heavily cited by everyone)
    nodes = [
        PaperNode(doi="10.1/a", title="A"),
        PaperNode(doi="10.1/b", title="B"),
        PaperNode(doi="10.1/c", title="C"),
        PaperNode(doi="10.1/d", title="D"),
    ]
    edges = [
        GraphEdge(source="10.1/a", target="10.1/b"),
        GraphEdge(source="10.1/c", target="10.1/b"),
        GraphEdge(source="10.1/d", target="10.1/b"),
        # Duplicate and self-loop should be ignored
        GraphEdge(source="10.1/a", target="10.1/b"),
        GraphEdge(source="10.1/b", target="10.1/b"),
    ]

    compute_pagerank_and_degrees(nodes, edges, damping=0.85)

    by_doi = {n.doi: n for n in nodes}
    assert by_doi["10.1/b"].rank == 1
    assert by_doi["10.1/b"].in_degree == 3
    assert by_doi["10.1/b"].out_degree == 0
    assert by_doi["10.1/a"].out_degree == 1
    assert by_doi["10.1/a"].in_degree == 0
    assert math.isclose(sum(n.pagerank for n in nodes), 1.0, rel_tol=1e-6)
    assert by_doi["10.1/b"].pagerank > by_doi["10.1/a"].pagerank


def test_pagerank_handles_cycles() -> None:
    nodes = [PaperNode(doi="10.1/x"), PaperNode(doi="10.1/y")]
    edges = [
        GraphEdge(source="10.1/x", target="10.1/y"),
        GraphEdge(source="10.1/y", target="10.1/x"),
    ]
    compute_pagerank_and_degrees(nodes, edges, damping=0.85)
    assert math.isclose(nodes[0].pagerank, 0.5, abs_tol=1e-6)
    assert math.isclose(nodes[1].pagerank, 0.5, abs_tol=1e-6)
    assert nodes[0].rank == 1
    assert nodes[1].rank == 2
