"""Shared polite rate limiter and HTTP retry helpers."""

from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx


class PoliteRateLimiter:
    """Async rate limiter enforcing minimum interval between requests and concurrency cap."""

    def __init__(self, max_concurrency: int = 5, min_interval: float = 0.1) -> None:
        self._semaphore = asyncio.Semaphore(max_concurrency)
        self._lock = asyncio.Lock()
        self._min_interval = min_interval
        self._last_request_ts = 0.0

    async def acquire(self) -> None:
        await self._semaphore.acquire()
        if self._min_interval > 0:
            async with self._lock:
                now = time.monotonic()
                wait = self._min_interval - (now - self._last_request_ts)
                if wait > 0:
                    await asyncio.sleep(wait)
                self._last_request_ts = time.monotonic()

    def release(self) -> None:
        self._semaphore.release()

    async def __aenter__(self) -> "PoliteRateLimiter":
        await self.acquire()
        return self

    async def __aexit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        self.release()


async def get_json_with_retry(
    client: httpx.AsyncClient,
    url: str,
    *,
    limiter: PoliteRateLimiter | None = None,
    params: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    max_retries: int = 2,
) -> tuple[int, dict[str, Any] | None]:
    """Perform an async GET request returning (status_code, parsed_json_or_none)."""
    attempt = 0
    while True:
        attempt += 1
        try:
            if limiter is not None:
                async with limiter:
                    resp = await client.get(url, params=params, headers=headers)
            else:
                resp = await client.get(url, params=params, headers=headers)

            if resp.status_code == 200:
                try:
                    return 200, resp.json()
                except Exception:
                    return 200, None

            if resp.status_code in (429, 500, 502, 503, 504) and attempt <= max_retries:
                retry_after = resp.headers.get("Retry-After")
                delay = 0.6 * attempt
                if retry_after:
                    try:
                        delay = min(float(retry_after), 4.0)
                    except ValueError:
                        pass
                await asyncio.sleep(delay)
                continue

            return resp.status_code, None
        except (httpx.TimeoutException, httpx.TransportError):
            if attempt <= max_retries:
                await asyncio.sleep(0.4 * attempt)
                continue
            return 0, None
