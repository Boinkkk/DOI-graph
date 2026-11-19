"""Configuration settings for DOI-Graph backend."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    db_path: Path = Path(os.getenv("DOI_GRAPH_DB_PATH", "data/doi_graph.db"))
    user_agent: str = os.getenv(
        "DOI_GRAPH_USER_AGENT",
        "DOI-Graph/1.0 (https://github.com/doi-graph; mailto:research@doi-graph.local)",
    )
    openalex_mailto: str | None = os.getenv("OPENALEX_MAILTO", "research@doi-graph.local")
    s2_api_key: str | None = os.getenv("SEMANTIC_SCHOLAR_API_KEY")
    http_timeout: float = float(os.getenv("DOI_GRAPH_HTTP_TIMEOUT", "15.0"))
    max_concurrency: int = int(os.getenv("DOI_GRAPH_MAX_CONCURRENCY", "5"))
    min_request_interval: float = float(os.getenv("DOI_GRAPH_MIN_INTERVAL", "0.12"))
    max_refs_per_paper: int = int(os.getenv("DOI_GRAPH_MAX_REFS_PER_PAPER", "120"))
    max_cites_per_paper: int = int(os.getenv("DOI_GRAPH_MAX_CITES_PER_PAPER", "120"))


settings = Settings()
