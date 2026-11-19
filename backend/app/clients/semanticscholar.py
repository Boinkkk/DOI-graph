"""Semantic Scholar Graph API client."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

import httpx

from ..doi_utils import normalize_doi
from ..models import PaperMetadataResult
from .base import PoliteRateLimiter, get_json_with_retry

S2_BASE = "https://api.semanticscholar.org/graph/v1/paper"
S2_FIELDS = (
    "externalIds,title,authors,year,venue,journal,citationCount,"
    "isOpenAccess,openAccessPdf,references.externalIds,citations.externalIds"
)


class SemanticScholarClient:
    """Async Semantic Scholar API client."""

    def __init__(
        self,
        client: httpx.AsyncClient,
        limiter: PoliteRateLimiter,
        api_key: str | None = None,
        max_refs: int = 120,
        max_cites: int = 120,
    ) -> None:
        self.client = client
        self.limiter = limiter
        self.api_key = api_key
        self.max_refs = max_refs
        self.max_cites = max_cites

    async def fetch_paper(self, doi: str) -> PaperMetadataResult | None:
        norm_doi = normalize_doi(doi)
        if not norm_doi:
            return None

        url = f"{S2_BASE}/DOI:{quote(norm_doi, safe='')}"
        headers = {"x-api-key": self.api_key} if self.api_key else None
        status, data = await get_json_with_retry(
            self.client,
            url,
            limiter=self.limiter,
            params={"fields": S2_FIELDS},
            headers=headers,
        )
        if status != 200 or not isinstance(data, dict):
            return None

        ext_ids = data.get("externalIds") or {}
        resolved_doi = normalize_doi(ext_ids.get("DOI")) or norm_doi

        title = (data.get("title") or "Untitled Paper").strip()
        authors = [str(a["name"]) for a in (data.get("authors") or []) if a.get("name")]
        year = data.get("year") if isinstance(data.get("year"), int) else None

        journal_obj = data.get("journal") or {}
        journal = journal_obj.get("name") or data.get("venue") or None
        if journal:
            journal = str(journal).strip() or None

        citation_count = int(data.get("citationCount") or 0)
        is_oa = bool(data.get("isOpenAccess", False))
        oa_pdf = data.get("openAccessPdf") or {}
        oa_url = oa_pdf.get("url")

        ref_dois: list[str] = []
        seen_refs: set[str] = set()
        for ref in data.get("references") or []:
            r_doi = normalize_doi((ref.get("externalIds") or {}).get("DOI"))
            if r_doi and r_doi not in seen_refs:
                seen_refs.add(r_doi)
                ref_dois.append(r_doi)
            if len(ref_dois) >= self.max_refs:
                break

        cite_dois: list[str] = []
        seen_cites: set[str] = set()
        for cite in data.get("citations") or []:
            c_doi = normalize_doi((cite.get("externalIds") or {}).get("DOI"))
            if c_doi and c_doi not in seen_cites:
                seen_cites.add(c_doi)
                cite_dois.append(c_doi)
            if len(cite_dois) >= self.max_cites:
                break

        return PaperMetadataResult(
            doi=resolved_doi,
            title=title,
            authors=authors,
            year=year,
            journal=journal,
            citation_count=citation_count,
            is_oa=is_oa,
            oa_url=oa_url,
            source_api="semanticscholar",
            reference_dois=ref_dois,
            citation_dois=cite_dois,
        )
