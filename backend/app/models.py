"""Pydantic models for DOI-Graph API, crawler, and storage."""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


class CrawlDirection(str, Enum):
    REFERENCES = "references"
    CITATIONS = "citations"
    BOTH = "both"


class CrawlRequest(BaseModel):
    seeds: list[str] = Field(..., min_length=1, description="List of seed DOIs or doi.org URLs")
    max_depth: int = Field(default=2, ge=0, description="Maximum BFS depth (unlimited)")
    max_papers: int = Field(default=200, ge=1, le=10000, description="Maximum total papers to crawl")
    direction: CrawlDirection = Field(default=CrawlDirection.BOTH)


class PaperNode(BaseModel):
    doi: str
    title: str = "Untitled Paper"
    authors: list[str] = Field(default_factory=list)
    year: int | None = None
    journal: str | None = None
    citation_count: int = 0
    is_oa: bool = False
    oa_url: str | None = None
    depth: int = 0
    is_seed: bool = False
    source_api: str = "openalex"
    pagerank: float = 0.0
    rank: int = 0
    in_degree: int = 0
    out_degree: int = 0


class GraphEdge(BaseModel):
    source: str
    target: str


class GraphStats(BaseModel):
    total_nodes: int
    total_edges: int
    max_depth_reached: int
    direction: str
    seeds: list[str]
    cancelled: bool = False


class GraphPayload(BaseModel):
    nodes: list[PaperNode]
    edges: list[GraphEdge]
    stats: GraphStats


class HistorySummary(BaseModel):
    id: str
    title: str
    seeds: list[str]
    direction: str
    max_depth: int
    max_papers: int
    node_count: int
    edge_count: int
    cancelled: bool
    compressed_bytes: int
    created_at: str


class PaperMetadataResult(BaseModel):
    """Internal metadata structure returned by scientific API clients."""

    doi: str
    title: str = "Untitled Paper"
    authors: list[str] = Field(default_factory=list)
    year: int | None = None
    journal: str | None = None
    citation_count: int = 0
    is_oa: bool = False
    oa_url: str | None = None
    source_api: str = "openalex"
    reference_dois: list[str] = Field(default_factory=list)
    citation_dois: list[str] = Field(default_factory=list)
    extra: dict[str, Any] = Field(default_factory=dict)
