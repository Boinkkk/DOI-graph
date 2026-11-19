"""Unit tests for async BFS CitationCrawler."""

from __future__ import annotations

import asyncio

import pytest

from app.crawler import CitationCrawler
from app.models import CrawlDirection, CrawlRequest, PaperMetadataResult


class FakeResolver:
    """In-memory mocked DoiMetadataResolver for deterministic BFS testing."""

    def __init__(self, graph: dict[str, PaperMetadataResult], delay: float = 0.0) -> None:
        self.graph = graph
        self.delay = delay
        self.calls: list[str] = []

    async def resolve(self, doi: str, direction: CrawlDirection) -> PaperMetadataResult | None:
        self.calls.append(doi)
        if self.delay > 0:
            await asyncio.sleep(self.delay)
        item = self.graph.get(doi)
        if not item:
            return None
        return item.model_copy(
            update={
                "reference_dois": item.reference_dois
                if direction in (CrawlDirection.REFERENCES, CrawlDirection.BOTH)
                else [],
                "citation_dois": item.citation_dois
                if direction in (CrawlDirection.CITATIONS, CrawlDirection.BOTH)
                else [],
            }
        )


@pytest.mark.asyncio
async def test_bfs_handles_cycles_and_records_all_edges() -> None:
    # Mutual cycle: seed -> A, A -> seed, seed -> B, A -> B
    graph = {
        "10.1001/seed": PaperMetadataResult(
            doi="10.1001/seed",
            title="Seed",
            reference_dois=["10.1001/a", "10.1001/b"],
            citation_dois=["10.1001/a"],
        ),
        "10.1001/a": PaperMetadataResult(
            doi="10.1001/a",
            title="Paper A",
            reference_dois=["10.1001/seed", "10.1001/b"],
            citation_dois=["10.1001/seed"],
        ),
        "10.1001/b": PaperMetadataResult(
            doi="10.1001/b",
            title="Paper B",
            reference_dois=[],
            citation_dois=["10.1001/seed", "10.1001/a"],
        ),
    }
    resolver = FakeResolver(graph)
    crawler = CitationCrawler(resolver, max_concurrency=2)  # type: ignore[arg-type]

    req = CrawlRequest(
        seeds=["https://doi.org/10.1001/SEED"],
        max_depth=3,
        max_papers=50,
        direction=CrawlDirection.BOTH,
    )

    events: list[tuple[str, dict]] = []
    async for ev in crawler.crawl_stream(req):
        events.append(ev)

    complete = [p for name, p in events if name == "complete"][0]
    node_dois = {n["doi"] for n in complete["nodes"]}
    edge_pairs = {(e["source"], e["target"]) for e in complete["edges"]}

    assert node_dois == {"10.1001/seed", "10.1001/a", "10.1001/b"}
    assert edge_pairs == {
        ("10.1001/seed", "10.1001/a"),
        ("10.1001/a", "10.1001/seed"),
        ("10.1001/seed", "10.1001/b"),
        ("10.1001/a", "10.1001/b"),
    }
    # Visited set prevented re-crawling any node more than once
    assert len(resolver.calls) == 3


@pytest.mark.asyncio
async def test_bfs_unlimited_depth_beyond_5() -> None:
    # Chain of length 7: d0 -> d1 -> d2 -> d3 -> d4 -> d5 -> d6
    graph = {}
    for i in range(7):
        refs = [f"10.1001/d{i + 1}"] if i < 6 else []
        graph[f"10.1001/d{i}"] = PaperMetadataResult(
            doi=f"10.1001/d{i}",
            title=f"Depth {i}",
            reference_dois=refs,
        )

    resolver = FakeResolver(graph)
    crawler = CitationCrawler(resolver, max_concurrency=3)  # type: ignore[arg-type]
    req = CrawlRequest(
        seeds=["10.1001/d0"],
        max_depth=6,
        max_papers=50,
        direction=CrawlDirection.REFERENCES,
    )

    complete = None
    async for name, payload in crawler.crawl_stream(req):
        if name == "complete":
            complete = payload

    assert complete is not None
    assert len(complete["nodes"]) == 7
    assert complete["stats"]["max_depth_reached"] == 6


@pytest.mark.asyncio
async def test_bfs_respects_max_papers_and_cancellation() -> None:
    graph = {
        "10.1001/root": PaperMetadataResult(
            doi="10.1001/root",
            title="Root",
            reference_dois=[f"10.1001/r{i}" for i in range(10)],
        )
    }
    for i in range(10):
        graph[f"10.1001/r{i}"] = PaperMetadataResult(doi=f"10.1001/r{i}", title=f"Ref {i}")

    resolver = FakeResolver(graph, delay=0.01)
    crawler = CitationCrawler(resolver, max_concurrency=2)  # type: ignore[arg-type]

    req = CrawlRequest(
        seeds=["10.1001/root"],
        max_depth=2,
        max_papers=4,
        direction=CrawlDirection.REFERENCES,
    )
    complete = None
    async for name, payload in crawler.crawl_stream(req):
        if name == "complete":
            complete = payload
    assert complete is not None
    assert len(complete["nodes"]) <= 4

    # Test cancellation
    cancel_ev = asyncio.Event()
    cancel_ev.set()
    cancelled_complete = None
    async for name, payload in crawler.crawl_stream(req, cancel_event=cancel_ev):
        if name == "complete":
            cancelled_complete = payload
    assert cancelled_complete is not None
    assert cancelled_complete["stats"]["cancelled"] is True
