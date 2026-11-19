"""Mocked HTTP API tests for OpenAlex, Crossref, Semantic Scholar, and doi.org fallback."""

from __future__ import annotations

import json

import httpx
import pytest

from app.clients.doi_resolver import DoiMetadataResolver
from app.models import CrawlDirection


@pytest.mark.asyncio
async def test_openalex_primary_resolution_and_batch_refs() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if "api.openalex.org/works/https://doi.org/10.1038/seed1" in url:
            return httpx.Response(
                200,
                json={
                    "id": "https://openalex.org/W100",
                    "doi": "https://doi.org/10.1038/SEED1",
                    "title": "Deep Citation Graph",
                    "publication_year": 2022,
                    "cited_by_count": 15,
                    "authorships": [{"author": {"display_name": "Alice"}}],
                    "primary_location": {"source": {"display_name": "Nature"}},
                    "open_access": {"is_oa": True, "oa_url": "https://oa.example/seed1.pdf"},
                    "referenced_works": ["https://openalex.org/W200"],
                },
            )
        if "api.openalex.org/works" in url and "filter=openalex" in url:
            return httpx.Response(
                200,
                json={
                    "results": [
                        {"id": "https://openalex.org/W200", "doi": "https://doi.org/10.1000/ref1"}
                    ]
                },
            )
        if "api.openalex.org/works" in url and "filter=cites" in url:
            return httpx.Response(
                200,
                json={
                    "results": [
                        {"id": "https://openalex.org/W300", "doi": "https://doi.org/10.1000/cite1"}
                    ]
                },
            )
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        resolver = DoiMetadataResolver(client, min_interval=0.0)
        res = await resolver.resolve("https://doi.org/10.1038/SEED1", CrawlDirection.BOTH)

    assert res is not None
    assert res.doi == "10.1038/seed1"
    assert res.title == "Deep Citation Graph"
    assert res.authors == ["Alice"]
    assert res.year == 2022
    assert res.journal == "Nature"
    assert res.is_oa is True
    assert res.oa_url == "https://oa.example/seed1.pdf"
    assert res.reference_dois == ["10.1000/ref1"]
    assert res.citation_dois == ["10.1000/cite1"]
    assert res.source_api == "openalex"


@pytest.mark.asyncio
async def test_crossref_and_s2_fallback_when_openalex_misses() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if "api.openalex.org" in url:
            return httpx.Response(404)
        if "api.semanticscholar.org" in url:
            return httpx.Response(404)
        if "api.crossref.org/works/10.1145%2Fcr1" in url:
            return httpx.Response(
                200,
                json={
                    "message": {
                        "title": ["Crossref Fallback Paper"],
                        "author": [{"given": "Ada", "family": "Lovelace"}],
                        "published-print": {"date-parts": [[2020, 5, 1]]},
                        "container-title": ["J. Computing"],
                        "is-referenced-by-count": 9,
                        "license": [{"URL": "https://creativecommons.org/licenses/by/4.0/"}],
                        "link": [{"content-type": "application/pdf", "URL": "https://cr.org/p.pdf"}],
                        "reference": [{"DOI": "10.1000/CR-REF"}],
                    }
                },
            )
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        resolver = DoiMetadataResolver(client, min_interval=0.0)
        res = await resolver.resolve("10.1145/cr1", CrawlDirection.REFERENCES)

    assert res is not None
    assert res.source_api == "crossref"
    assert res.title == "Crossref Fallback Paper"
    assert res.authors == ["Ada Lovelace"]
    assert res.year == 2020
    assert res.journal == "J. Computing"
    assert res.is_oa is True
    assert res.oa_url == "https://cr.org/p.pdf"
    assert res.reference_dois == ["10.1000/cr-ref"]


@pytest.mark.asyncio
async def test_s2_fallback_provides_citations_and_references() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if "api.openalex.org" in url:
            return httpx.Response(404)
        if "api.semanticscholar.org/graph/v1/paper/DOI:10.1000%2Fs2paper" in url:
            return httpx.Response(
                200,
                json={
                    "externalIds": {"DOI": "10.1000/S2PAPER"},
                    "title": "S2 Indexed Work",
                    "authors": [{"name": "Alan Turing"}],
                    "year": 2019,
                    "venue": "NeurIPS",
                    "citationCount": 120,
                    "isOpenAccess": True,
                    "openAccessPdf": {"url": "https://s2.org/paper.pdf"},
                    "references": [{"externalIds": {"DOI": "10.1000/refA"}}],
                    "citations": [{"externalIds": {"DOI": "10.1000/citeB"}}],
                },
            )
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        resolver = DoiMetadataResolver(client, min_interval=0.0)
        res = await resolver.resolve("10.1000/s2paper", CrawlDirection.BOTH)

    assert res is not None
    assert res.source_api == "semanticscholar"
    assert res.doi == "10.1000/s2paper"
    assert res.reference_dois == ["10.1000/refa"]
    assert res.citation_dois == ["10.1000/citeb"]


@pytest.mark.asyncio
async def test_doi_org_handle_fallback() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if "doi.org/api/handles/10.9999/rare" in url:
            return httpx.Response(
                200,
                json={
                    "responseCode": 1,
                    "values": [{"type": "URL", "data": {"value": "https://publisher.example/rare"}}],
                },
            )
        return httpx.Response(404)

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        resolver = DoiMetadataResolver(client, min_interval=0.0)
        res = await resolver.resolve("10.9999/rare", CrawlDirection.BOTH)

    assert res is not None
    assert res.source_api == "doi.org"
    assert res.doi == "10.9999/rare"
    assert res.extra.get("resolved_url") == "https://publisher.example/rare"
