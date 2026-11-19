"""Multi-provider DOI metadata & relation resolver with doi.org redirect fallback."""

from __future__ import annotations

import re

import httpx

from ..doi_utils import normalize_doi
from ..models import CrawlDirection, PaperMetadataResult
from .base import PoliteRateLimiter
from .crossref import CrossrefClient
from .openalex import OpenAlexClient
from .semanticscholar import SemanticScholarClient

_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)


class DoiMetadataResolver:
    """Resolves paper metadata and citation/reference DOIs across open scientific APIs.

    Priority:
      1. OpenAlex API (fast, rich OA & both references + citations)
      2. Semantic Scholar API (fallback/enrichment for metadata, references, citations)
      3. Crossref REST API (fallback/enrichment for metadata & references)
      4. doi.org redirect resolution (last-resort fallback when scholarly indexes miss a DOI)
    """

    def __init__(
        self,
        client: httpx.AsyncClient,
        *,
        openalex_mailto: str | None = None,
        s2_api_key: str | None = None,
        max_concurrency: int = 5,
        min_interval: float = 0.12,
        max_refs: int = 120,
        max_cites: int = 120,
    ) -> None:
        self.client = client
        self.limiter = PoliteRateLimiter(max_concurrency=max_concurrency, min_interval=min_interval)
        self.openalex = OpenAlexClient(
            client,
            self.limiter,
            mailto=openalex_mailto,
            max_refs=max_refs,
            max_cites=max_cites,
        )
        self.crossref = CrossrefClient(client, self.limiter, max_refs=max_refs)
        self.s2 = SemanticScholarClient(
            client,
            self.limiter,
            api_key=s2_api_key,
            max_refs=max_refs,
            max_cites=max_cites,
        )

    async def resolve(
        self,
        doi: str,
        direction: CrawlDirection,
    ) -> PaperMetadataResult | None:
        norm_doi = normalize_doi(doi)
        if not norm_doi:
            return None

        need_refs = direction in (CrawlDirection.REFERENCES, CrawlDirection.BOTH)
        need_cites = direction in (CrawlDirection.CITATIONS, CrawlDirection.BOTH)

        result = await self.openalex.fetch_paper(
            norm_doi,
            include_references=need_refs,
            include_citations=need_cites,
        )

        # Fallback or enrich if OpenAlex missed the paper or lacked needed relations
        if result is None:
            result = await self.s2.fetch_paper(norm_doi)
            if result is None or (need_refs and not result.reference_dois):
                cr = await self.crossref.fetch_paper(norm_doi)
                if cr is not None:
                    result = _merge_metadata(result, cr) if result is not None else cr
        else:
            missing_refs = need_refs and not result.reference_dois
            missing_cites = need_cites and result.citation_count > 0 and not result.citation_dois
            if missing_refs or missing_cites:
                s2_res = await self.s2.fetch_paper(norm_doi)
                if s2_res is not None:
                    result = _merge_metadata(result, s2_res)
                if need_refs and not result.reference_dois:
                    cr_res = await self.crossref.fetch_paper(norm_doi)
                    if cr_res is not None:
                        result = _merge_metadata(result, cr_res)

        if result is None:
            result = await self._fallback_doi_org_redirect(norm_doi)

        if result is not None:
            # Ensure clean normalized lists without self-loops
            result.reference_dois = _clean_doi_list(result.reference_dois, exclude=result.doi)
            result.citation_dois = _clean_doi_list(result.citation_dois, exclude=result.doi)
        return result

    async def _fallback_doi_org_redirect(self, norm_doi: str) -> PaperMetadataResult | None:
        """Follow doi.org redirect or DOI Handle API as a final fallback."""
        try:
            async with self.limiter:
                # First try doi.org REST handle API (returns target URL without hitting publisher Cloudflare)
                handle_resp = await self.client.get(
                    f"https://doi.org/api/handles/{norm_doi}",
                    follow_redirects=True,
                )
                if handle_resp.status_code == 200:
                    payload = handle_resp.json()
                    values = payload.get("values") or []
                    landing_url = None
                    for v in values:
                        if v.get("type") == "URL":
                            landing_url = (v.get("data") or {}).get("value")
                            break
                    if landing_url:
                        return PaperMetadataResult(
                            doi=norm_doi,
                            title=f"DOI {norm_doi}",
                            source_api="doi.org",
                            oa_url=None,
                            extra={"resolved_url": landing_url},
                        )

                # Fallback: follow redirect directly (accepting HTML/text)
                resp = await self.client.get(
                    f"https://doi.org/{norm_doi}",
                    follow_redirects=True,
                )
                if 200 <= resp.status_code < 400:
                    title = f"DOI {norm_doi}"
                    content_type = resp.headers.get("content-type", "")
                    if "html" in content_type.lower():
                        m = _TITLE_RE.search(resp.text[:8192])
                        if m:
                            extracted = re.sub(r"\s+", " ", m.group(1)).strip()
                            if extracted and "cloudflare" not in extracted.lower() and "just a moment" not in extracted.lower():
                                title = extracted
                    return PaperMetadataResult(
                        doi=norm_doi,
                        title=title,
                        source_api="doi.org",
                        extra={"resolved_url": str(resp.url)},
                    )
        except Exception:
            return None
        return None


def _clean_doi_list(dois: list[str], *, exclude: str) -> list[str]:
    seen: set[str] = set()
    cleaned: list[str] = []
    for d in dois:
        nd = normalize_doi(d)
        if nd and nd != exclude and nd not in seen:
            seen.add(nd)
            cleaned.append(nd)
    return cleaned


def _merge_metadata(primary: PaperMetadataResult, secondary: PaperMetadataResult) -> PaperMetadataResult:
    """Enrich primary PaperMetadataResult with missing fields/relations from secondary."""
    if primary.title == "Untitled Paper" and secondary.title != "Untitled Paper":
        primary.title = secondary.title
    if not primary.authors and secondary.authors:
        primary.authors = secondary.authors
    if primary.year is None and secondary.year is not None:
        primary.year = secondary.year
    if not primary.journal and secondary.journal:
        primary.journal = secondary.journal
    if primary.citation_count == 0 and secondary.citation_count > 0:
        primary.citation_count = secondary.citation_count
    if not primary.is_oa and secondary.is_oa:
        primary.is_oa = True
    if not primary.oa_url and secondary.oa_url:
        primary.oa_url = secondary.oa_url
    if not primary.reference_dois and secondary.reference_dois:
        primary.reference_dois = secondary.reference_dois
    if not primary.citation_dois and secondary.citation_dois:
        primary.citation_dois = secondary.citation_dois
    return primary
