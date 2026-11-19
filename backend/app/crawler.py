"""Asynchronous BFS citation network crawler with real-time SSE event streaming."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from collections.abc import AsyncIterator
from typing import Any

from .clients.doi_resolver import DoiMetadataResolver
from .doi_utils import parse_seed_dois
from .models import (
    CrawlDirection,
    CrawlRequest,
    GraphEdge,
    GraphPayload,
    GraphStats,
    PaperMetadataResult,
    PaperNode,
)
from .pagerank import compute_pagerank_and_degrees


class CitationCrawler:
    """Async BFS crawler for DOI citation networks."""

    def __init__(
        self,
        resolver: DoiMetadataResolver,
        *,
        max_concurrency: int = 5,
    ) -> None:
        self.resolver = resolver
        self.max_concurrency = max(1, max_concurrency)

    async def crawl_stream(
        self,
        request: CrawlRequest,
        cancel_event: asyncio.Event | None = None,
    ) -> AsyncIterator[tuple[str, dict[str, Any]]]:
        """Execute BFS crawl and yield (event_name, payload_dict) SSE events.

        The final event is always `complete` containing the full GraphPayload dict
        with computed PageRank, degrees, and rankings.
        """
        seeds = parse_seed_dois(request.seeds)
        if not seeds:
            yield (
                "error",
                {"message": "No valid DOIs found in input seeds."},
            )
            return

        cancel = cancel_event or asyncio.Event()
        seed_set = set(seeds)

        nodes_by_doi: dict[str, PaperNode] = {}
        edges_set: set[tuple[str, str]] = set()
        emitted_edges: list[GraphEdge] = []
        pending_edges: dict[str, list[tuple[str, str]]] = defaultdict(list)

        seen_queue: set[str] = set()
        current_frontier: list[str] = []
        for s in seeds:
            if len(seen_queue) >= request.max_papers:
                break
            if s not in seen_queue:
                seen_queue.add(s)
                current_frontier.append(s)

        max_depth_reached = 0
        yield (
            "status",
            {
                "message": f"Starting BFS crawl from {len(current_frontier)} seed DOI(s)...",
                "depth": 0,
                "queued": len(current_frontier),
                "nodes": 0,
                "edges": 0,
            },
        )

        for depth in range(request.max_depth + 1):
            if cancel.is_set() or not current_frontier or len(nodes_by_doi) >= request.max_papers:
                break

            max_depth_reached = depth
            remaining_budget = request.max_papers - len(nodes_by_doi)
            batch = current_frontier[:remaining_budget]
            next_frontier: list[str] = []

            yield (
                "status",
                {
                    "message": f"Exploring depth {depth} ({len(batch)} paper(s))...",
                    "depth": depth,
                    "queued": len(batch),
                    "nodes": len(nodes_by_doi),
                    "edges": len(emitted_edges),
                },
            )

            fetch_relations = (depth < request.max_depth) or (depth == 0 and len(seeds) > 1)
            effective_direction = request.direction if fetch_relations else CrawlDirection.REFERENCES

            sem = asyncio.Semaphore(self.max_concurrency)

            async def _fetch_one(target_doi: str) -> tuple[str, PaperMetadataResult | None]:
                async with sem:
                    if cancel.is_set():
                        return target_doi, None
                    if not fetch_relations:
                        # Only metadata needed at leaf depth unless multi-seed depth 0
                        meta = await self.resolver.resolve(target_doi, CrawlDirection.REFERENCES)
                        return target_doi, meta
                    meta = await self.resolver.resolve(target_doi, effective_direction)
                    return target_doi, meta

            tasks = [asyncio.create_task(_fetch_one(doi)) for doi in batch]

            try:
                for fut in asyncio.as_completed(tasks):
                    if cancel.is_set():
                        for t in tasks:
                            if not t.done():
                                t.cancel()
                        break

                    doi, meta = await fut
                    if len(nodes_by_doi) >= request.max_papers:
                        continue

                    if meta is None:
                        # Still create minimal node if it was a seed so user sees feedback
                        if doi in seed_set and doi not in nodes_by_doi:
                            node = PaperNode(
                                doi=doi,
                                title=f"Unresolved DOI ({doi})",
                                depth=depth,
                                is_seed=True,
                                source_api="unresolved",
                            )
                            nodes_by_doi[doi] = node
                            yield ("node", node.model_dump())
                        continue

                    canonical_doi = meta.doi
                    if canonical_doi in nodes_by_doi:
                        continue

                    node = PaperNode(
                        doi=canonical_doi,
                        title=meta.title,
                        authors=meta.authors,
                        year=meta.year,
                        journal=meta.journal,
                        citation_count=meta.citation_count,
                        is_oa=meta.is_oa,
                        oa_url=meta.oa_url,
                        depth=depth,
                        is_seed=(canonical_doi in seed_set or doi in seed_set),
                        source_api=meta.source_api,
                    )
                    nodes_by_doi[canonical_doi] = node
                    # Also alias if doi.org normalized differently
                    if doi != canonical_doi and doi in seed_set:
                        node.is_seed = True
                    yield ("node", node.model_dump())

                    # Flush any pending edges waiting for this node
                    for src_doi, dst_doi in pending_edges.pop(canonical_doi, []):
                        if src_doi in nodes_by_doi and dst_doi in nodes_by_doi and src_doi != dst_doi:
                            if (src_doi, dst_doi) not in edges_set:
                                edges_set.add((src_doi, dst_doi))
                                edge = GraphEdge(source=src_doi, target=dst_doi)
                                emitted_edges.append(edge)
                                yield ("edge", edge.model_dump())

                    # Discover outgoing references (canonical_doi -> ref_doi)
                    if request.direction in (CrawlDirection.REFERENCES, CrawlDirection.BOTH):
                        for ref_doi in meta.reference_dois:
                            if ref_doi == canonical_doi:
                                continue
                            if depth < request.max_depth and ref_doi not in seen_queue:
                                if len(seen_queue) < request.max_papers:
                                    seen_queue.add(ref_doi)
                                    next_frontier.append(ref_doi)

                            if ref_doi in nodes_by_doi:
                                if (canonical_doi, ref_doi) not in edges_set:
                                    edges_set.add((canonical_doi, ref_doi))
                                    edge = GraphEdge(source=canonical_doi, target=ref_doi)
                                    emitted_edges.append(edge)
                                    yield ("edge", edge.model_dump())
                            elif ref_doi in seen_queue:
                                pending_edges[ref_doi].append((canonical_doi, ref_doi))

                    # Discover incoming citations (cite_doi -> canonical_doi)
                    if request.direction in (CrawlDirection.CITATIONS, CrawlDirection.BOTH):
                        for cite_doi in meta.citation_dois:
                            if cite_doi == canonical_doi:
                                continue
                            if depth < request.max_depth and cite_doi not in seen_queue:
                                if len(seen_queue) < request.max_papers:
                                    seen_queue.add(cite_doi)
                                    next_frontier.append(cite_doi)

                            if cite_doi in nodes_by_doi:
                                if (cite_doi, canonical_doi) not in edges_set:
                                    edges_set.add((cite_doi, canonical_doi))
                                    edge = GraphEdge(source=cite_doi, target=canonical_doi)
                                    emitted_edges.append(edge)
                                    yield ("edge", edge.model_dump())
                            elif cite_doi in seen_queue:
                                pending_edges[cite_doi].append((cite_doi, canonical_doi))

                    yield (
                        "progress",
                        {
                            "nodes": len(nodes_by_doi),
                            "edges": len(emitted_edges),
                            "depth": depth,
                            "queued": len(next_frontier),
                        },
                    )
            except asyncio.CancelledError:
                cancel.set()
                for t in tasks:
                    if not t.done():
                        t.cancel()

            current_frontier = next_frontier

        # Finalize graph & compute PageRank
        node_list = list(nodes_by_doi.values())
        compute_pagerank_and_degrees(node_list, emitted_edges, damping=0.85)

        stats = GraphStats(
            total_nodes=len(node_list),
            total_edges=len(emitted_edges),
            max_depth_reached=max_depth_reached,
            direction=request.direction.value,
            seeds=seeds,
            cancelled=cancel.is_set(),
        )
        payload = GraphPayload(nodes=node_list, edges=emitted_edges, stats=stats)
        yield ("complete", payload.model_dump())
