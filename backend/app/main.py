"""FastAPI application for DOI-Graph backend."""

from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .clients.doi_resolver import DoiMetadataResolver
from .config import settings
from .crawler import CitationCrawler
from .models import CrawlRequest, GraphPayload, HistorySummary
from .storage import CrawlHistoryStore


def _format_sse(event: str, data: dict[str, Any]) -> str:
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return f"event: {event}\ndata: {payload}\n\n"


def create_app(
    *,
    store: CrawlHistoryStore | None = None,
    http_client_factory: Callable[[], httpx.AsyncClient] | None = None,
) -> FastAPI:
    """Application factory supporting dependency injection for tests."""
    history_store = store or CrawlHistoryStore(settings.db_path)
    active_cancellations: dict[str, asyncio.Event] = {}

    def _default_client_factory() -> httpx.AsyncClient:
        return httpx.AsyncClient(
            timeout=httpx.Timeout(settings.http_timeout),
            headers={"User-Agent": settings.user_agent},
            follow_redirects=True,
        )

    client_factory = http_client_factory or _default_client_factory

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        yield
        for ev in active_cancellations.values():
            ev.set()

    app = FastAPI(
        title="DOI-Graph API",
        version="1.0.0",
        description="Interactive scholarly citation network explorer & PageRank analyzer",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.state.history_store = history_store
    app.state.active_cancellations = active_cancellations

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/api/crawl/stream")
    async def crawl_stream(
        crawl_req: CrawlRequest,
        request: Request,
    ) -> StreamingResponse:
        crawl_id = uuid.uuid4().hex[:12]
        cancel_event = asyncio.Event()
        active_cancellations[crawl_id] = cancel_event

        async def event_generator() -> AsyncIterator[str]:
            yield _format_sse("started", {"crawl_id": crawl_id})
            try:
                async with client_factory() as client:
                    resolver = DoiMetadataResolver(
                        client,
                        openalex_mailto=settings.openalex_mailto,
                        s2_api_key=settings.s2_api_key,
                        max_concurrency=settings.max_concurrency,
                        min_interval=settings.min_request_interval,
                        max_refs=settings.max_refs_per_paper,
                        max_cites=settings.max_cites_per_paper,
                    )
                    crawler = CitationCrawler(
                        resolver,
                        max_concurrency=settings.max_concurrency,
                    )

                    async for event_name, payload in crawler.crawl_stream(
                        crawl_req, cancel_event=cancel_event
                    ):
                        if await request.is_disconnected():
                            cancel_event.set()
                            break

                        if event_name == "complete":
                            graph_payload = GraphPayload.model_validate(payload)
                            if graph_payload.nodes:
                                saved = history_store.save_crawl(
                                    graph_payload,
                                    max_depth=crawl_req.max_depth,
                                    max_papers=crawl_req.max_papers,
                                )
                                payload["history_id"] = saved.id
                                payload["history_summary"] = saved.model_dump()

                        yield _format_sse(event_name, payload)
            except asyncio.CancelledError:
                cancel_event.set()
            except Exception as exc:
                yield _format_sse("error", {"message": f"Crawl failed: {exc}"})
            finally:
                active_cancellations.pop(crawl_id, None)

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    @app.post("/api/crawl/{crawl_id}/cancel")
    async def cancel_crawl(crawl_id: str) -> dict[str, Any]:
        ev = active_cancellations.get(crawl_id)
        if ev is None:
            return {"cancelled": False, "crawl_id": crawl_id, "detail": "Crawl not active"}
        ev.set()
        return {"cancelled": True, "crawl_id": crawl_id}

    @app.get("/api/history", response_model=list[HistorySummary])
    async def list_history(limit: int = 50) -> list[HistorySummary]:
        return history_store.list_history(limit=max(1, min(limit, 200)))

    @app.get("/api/history/{history_id}", response_model=GraphPayload)
    async def get_history_item(history_id: str) -> GraphPayload:
        payload = history_store.get_crawl(history_id)
        if payload is None:
            raise HTTPException(status_code=404, detail="History item not found")
        return payload

    @app.get("/api/history/{history_id}/download")
    async def download_history_gzip(history_id: str) -> Response:
        res = history_store.get_crawl_gzip(history_id)
        if res is None:
            raise HTTPException(status_code=404, detail="History item not found")
        gz_bytes, filename = res
        return Response(
            content=gz_bytes,
            media_type="application/gzip",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    @app.delete("/api/history/{history_id}")
    async def delete_history_item(history_id: str) -> dict[str, Any]:
        deleted = history_store.delete_crawl(history_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="History item not found")
        return {"deleted": True, "id": history_id}

    return app


app = create_app()
