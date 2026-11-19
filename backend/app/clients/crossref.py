"""Crossref REST API client for metadata and reference DOIs."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

import httpx

from ..doi_utils import normalize_doi
from ..models import PaperMetadataResult
from .base import PoliteRateLimiter, get_json_with_retry

CROSSREF_BASE = "https://api.crossref.org/works"


def _extract_year(message: dict[str, Any]) -> int | None:
    for field in ("published-print", "published-online", "published", "issued", "created"):
        part = message.get(field) or {}
        date_parts = part.get("date-parts")
        if isinstance(date_parts, list) and date_parts and isinstance(date_parts[0], list) and date_parts[0]:
            yr = date_parts[0][0]
            if isinstance(yr, int):
                return yr
    return None


class CrossrefClient:
    """Async Crossref REST API client."""

    def __init__(
        self,
        client: httpx.AsyncClient,
        limiter: PoliteRateLimiter,
        max_refs: int = 120,
    ) -> None:
        self.client = client
        self.limiter = limiter
        self.max_refs = max_refs

    async def fetch_paper(self, doi: str) -> PaperMetadataResult | None:
        norm_doi = normalize_doi(doi)
        if not norm_doi:
            return None

        url = f"{CROSSREF_BASE}/{quote(norm_doi, safe='')}"
        status, data = await get_json_with_retry(self.client, url, limiter=self.limiter)
        if status != 200 or not isinstance(data, dict):
            return None

        msg = data.get("message")
        if not isinstance(msg, dict):
            return None

        titles = msg.get("title") or []
        title = str(titles[0]).strip() if titles else "Untitled Paper"

        authors: list[str] = []
        for a in msg.get("author") or []:
            given = (a.get("given") or "").strip()
            family = (a.get("family") or "").strip()
            name = (a.get("name") or "").strip()
            full = f"{given} {family}".strip() if (given or family) else name
            if full:
                authors.append(full)

        year = _extract_year(msg)
        containers = msg.get("container-title") or []
        journal = str(containers[0]).strip() if containers else None
        citation_count = int(msg.get("is-referenced-by-count") or 0)

        # Check open access via license or PDF links
        is_oa = False
        oa_url: str | None = None
        for lic in msg.get("license") or []:
            lic_url = str(lic.get("URL") or "").lower()
            if "creativecommons.org" in lic_url or "open" in lic_url:
                is_oa = True
                break
        for link in msg.get("link") or []:
            if link.get("content-type") == "application/pdf" and link.get("URL"):
                oa_url = str(link["URL"])
                break

        ref_dois: list[str] = []
        seen: set[str] = set()
        for ref in msg.get("reference") or []:
            ref_doi = normalize_doi(ref.get("DOI"))
            if ref_doi and ref_doi not in seen:
                seen.add(ref_doi)
                ref_dois.append(ref_doi)
            if len(ref_dois) >= self.max_refs:
                break

        return PaperMetadataResult(
            doi=norm_doi,
            title=title,
            authors=authors,
            year=year,
            journal=journal,
            citation_count=citation_count,
            is_oa=is_oa,
            oa_url=oa_url if is_oa else None,
            source_api="crossref",
            reference_dois=ref_dois,
        )
