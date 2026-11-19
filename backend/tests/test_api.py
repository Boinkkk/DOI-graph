"""FastAPI endpoint and SSE streaming tests with mocked HTTP transport."""

from __future__ import annotations

import gzip
import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.storage import CrawlHistoryStore


def _mock_transport() -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if "api.openalex.org/works/https://doi.org/10.1000/seed" in url:
            return httpx.Response(
                200,
                json={
                    "id": "https://openalex.org/W1",
                    "doi": "https://doi.org/10.1000/seed",
                    "title": "Seed Paper API",
                    "publication_year": 2023,
                    "cited_by_count": 2,
                    "authorships": [{"author": {"display_name": "Dr. Seed"}}],
                    "primary_location": {"source": {"display_name": "Nature"}},
                    "open_access": {"is_oa": True, "oa_url": "https://oa.test/seed.pdf"},
                    "referenced_works": ["https://openalex.org/W2"],
                },
            )
        if "api.openalex.org/works/https://doi.org/10.1000/ref" in url:
            return httpx.Response(
                200,
                json={
                    "id": "https://openalex.org/W2",
                    "doi": "https://doi.org/10.1000/ref",
                    "title": "Referenced Paper API",
                    "publication_year": 2021,
                    "cited_by_count": 10,
                    "authorships": [{"author": {"display_name": "Dr. Ref"}}],
                    "primary_location": {"source": {"display_name": "Science"}},
                    "open_access": {"is_oa": False},
                    "referenced_works": [],
                },
            )
        if "api.openalex.org/works" in url and "filter=openalex" in url:
            return httpx.Response(
                200,
                json={
                    "results": [
                        {"id": "https://openalex.org/W2", "doi": "https://doi.org/10.1000/ref"}
                    ]
                },
            )
        if "api.openalex.org/works" in url and "filter=cites" in url:
            return httpx.Response(200, json={"results": []})
        return httpx.Response(404)

    return httpx.MockTransport(handler)


def _parse_sse(raw_text: str) -> list[tuple[str, dict]]:
    events: list[tuple[str, dict]] = []
    for block in raw_text.strip().split("\n\n"):
        event_name = "message"
        data_lines: list[str] = []
        for line in block.splitlines():
            if line.startswith("event:"):
                event_name = line[len("event:") :].strip()
            elif line.startswith("data:"):
                data_lines.append(line[len("data:") :].strip())
        if data_lines:
            events.append((event_name, json.loads("\n".join(data_lines))))
    return events


def test_api_crawl_stream_autosave_and_history_endpoints(tmp_path: Path) -> None:
    store = CrawlHistoryStore(tmp_path / "api_test.db")
    transport = _mock_transport()
    app = create_app(
        store=store,
        http_client_factory=lambda: httpx.AsyncClient(transport=transport),
    )

    with TestClient(app) as client:
        assert client.get("/api/health").json() == {"status": "ok"}

        resp = client.post(
            "/api/crawl/stream",
            json={
                "seeds": ["https://doi.org/10.1000/seed"],
                "max_depth": 1,
                "max_papers": 20,
                "direction": "references",
            },
        )
        assert resp.status_code == 200
        events = _parse_sse(resp.text)
        event_names = [e[0] for e in events]
        assert "started" in event_names
        assert "node" in event_names
        assert "edge" in event_names
        assert "complete" in event_names

        complete_payload = [p for n, p in events if n == "complete"][0]
        assert len(complete_payload["nodes"]) == 2
        assert len(complete_payload["edges"]) == 1
        history_id = complete_payload["history_id"]

        # History list should contain auto-saved crawl
        hist_resp = client.get("/api/history")
        assert hist_resp.status_code == 200
        items = hist_resp.json()
        assert len(items) == 1
        assert items[0]["id"] == history_id

        # Reload crawl
        reload_resp = client.get(f"/api/history/{history_id}")
        assert reload_resp.status_code == 200
        assert len(reload_resp.json()["nodes"]) == 2

        # Download .json.gz
        dl_resp = client.get(f"/api/history/{history_id}/download")
        assert dl_resp.status_code == 200
        decompressed = json.loads(gzip.decompress(dl_resp.content).decode("utf-8"))
        assert decompressed["v"] == 2
        assert len(decompressed["nodes"]) == 2

        # Delete crawl
        del_resp = client.delete(f"/api/history/{history_id}")
        assert del_resp.status_code == 200
        assert client.get("/api/history").json() == []
