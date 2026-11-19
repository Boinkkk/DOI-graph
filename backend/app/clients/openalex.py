"""OpenAlex API client for scholarly metadata, references, and citing works."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

import httpx

from ..doi_utils import normalize_doi
from ..models import PaperMetadataResult
from .base import PoliteRateLimiter, get_json_with_retry

OPENALEX_BASE = "https://api.openalex.org"


def _extract_openalex_short_id(oa_url: str | None) -> str | None:
    if not oa_url:
        return None
    part = oa_url.rstrip("/").rsplit("/", 1)[-1]
    if part.startswith("W"):
        return part
    return None


def _parse_openalex_work(
    work: dict[str, Any], fallback_doi: str | None = None
) -> tuple[PaperMetadataResult | None, list[str]]:
    doi = normalize_doi(work.get("doi")) or fallback_doi
    if not doi:
        return None, []

    title = (work.get("title") or work.get("display_name") or "Untitled Paper").strip()
    authors: list[str] = []
    for authorship in work.get("authorships") or []:
        author_obj = authorship.get("author") or {}
        name = author_obj.get("display_name")
        if name:
            authors.append(str(name))

    year = work.get("publication_year")
    if not isinstance(year, int):
        year = None

    journal = None
    primary_loc = work.get("primary_location") or {}
    source = primary_loc.get("source") or {}
    if source.get("display_name"):
        journal = str(source["display_name"])
    elif (work.get("host_venue") or {}).get("display_name"):
        journal = str(work["host_venue"]["display_name"])

    citation_count = int(work.get("cited_by_count") or 0)
    oa_info = work.get("open_access") or {}
    is_oa = bool(oa_info.get("is_oa", False))
    oa_url = oa_info.get("oa_url")
    if not oa_url:
        best_oa = work.get("best_oa_location") or {}
        oa_url = best_oa.get("pdf_url") or best_oa.get("landing_page_url")

    ref_oa_ids: list[str] = []
    for ref_url in work.get("referenced_works") or []:
        short_id = _extract_openalex_short_id(ref_url)
        if short_id:
            ref_oa_ids.append(short_id)

    oa_id = _extract_openalex_short_id(work.get("id"))

    meta = PaperMetadataResult(
        doi=doi,
        title=title,
        authors=authors,
        year=year,
        journal=journal,
        citation_count=citation_count,
        is_oa=is_oa,
        oa_url=oa_url,
        source_api="openalex",
        extra={"openalex_id": oa_id} if oa_id else {},
    )
    return meta, ref_oa_ids


class OpenAlexClient:
    """Async OpenAlex client with batched reference resolution."""

    def __init__(
        self,
        client: httpx.AsyncClient,
        limiter: PoliteRateLimiter,
        mailto: str | None = None,
        max_refs: int = 120,
        max_cites: int = 120,
    ) -> None:
        self.client = client
        self.limiter = limiter
        self.mailto = mailto
        self.max_refs = max_refs
        self.max_cites = max_cites

    def _base_params(self) -> dict[str, Any]:
        return {"mailto": self.mailto} if self.mailto else {}

    async def fetch_paper(
        self,
        doi: str,
        *,
        include_references: bool = True,
        include_citations: bool = True,
    ) -> PaperMetadataResult | None:
        norm_doi = normalize_doi(doi)
        if not norm_doi:
            return None

        encoded_doi = quote(f"https://doi.org/{norm_doi}", safe=":/")
        url = f"{OPENALEX_BASE}/works/{encoded_doi}"
        status, data = await get_json_with_retry(
            self.client, url, limiter=self.limiter, params=self._base_params()
        )
        if status != 200 or not isinstance(data, dict):
            return None

        meta, ref_oa_ids = _parse_openalex_work(data, fallback_doi=norm_doi)
        if not meta:
            return None

        if include_references and ref_oa_ids:
            meta.reference_dois = await self._resolve_oa_ids_to_dois(
                ref_oa_ids[: self.max_refs]
            )

        oa_id = meta.extra.get("openalex_id")
        if include_citations and oa_id and meta.citation_count > 0:
            meta.citation_dois = await self._fetch_citing_dois(oa_id, self.max_cites)

        return meta

    async def _resolve_oa_ids_to_dois(self, oa_ids: list[str]) -> list[str]:
        """Batch resolve OpenAlex W-IDs to normalized DOIs (chunks of 50)."""
        resolved: list[str] = []
        seen: set[str] = set()
        chunk_size = 50
        for i in range(0, len(oa_ids), chunk_size):
            chunk = oa_ids[i : i + chunk_size]
            filter_val = "|".join(chunk)
            params = {
                **self._base_params(),
                "filter": f"openalex:{filter_val}",
                "select": "id,doi",
                "per-page": len(chunk),
            }
            status, data = await get_json_with_retry(
                self.client, f"{OPENALEX_BASE}/works", limiter=self.limiter, params=params
            )
            if status != 200 or not isinstance(data, dict):
                continue
            for work in data.get("results") or []:
                doi = normalize_doi(work.get("doi"))
                if doi and doi not in seen:
                    seen.add(doi)
                    resolved.append(doi)
        return resolved

    async def _fetch_citing_dois(self, oa_id: str, limit: int) -> list[str]:
        """Fetch DOIs of papers that cite the given OpenAlex work ID."""
        per_page = min(limit, 200)
        params = {
            **self._base_params(),
            "filter": f"cites:{oa_id}",
            "select": "id,doi",
            "per-page": per_page,
            "sort": "cited_by_count:desc",
        }
        status, data = await get_json_with_retry(
            self.client, f"{OPENALEX_BASE}/works", limiter=self.limiter, params=params
        )
        if status != 200 or not isinstance(data, dict):
            return []

        citing: list[str] = []
        seen: set[str] = set()
        for work in data.get("results") or []:
            doi = normalize_doi(work.get("doi"))
            if doi and doi not in seen:
                seen.add(doi)
                citing.append(doi)
            if len(citing) >= limit:
                break
        return citing
