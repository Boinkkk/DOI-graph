"""SQLite + zlib compressed storage for auto-saved DOI-Graph crawl history."""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

from .compact_format import compress_gzip, compress_zlib, decompress_zlib
from .models import GraphPayload, HistorySummary


class CrawlHistoryStore:
    """Manages persistent compressed storage of crawled citation graphs in SQLite."""

    def __init__(self, db_path: str | Path) -> None:
        self.db_path = Path(db_path)
        if str(self.db_path) != ":memory:":
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS crawl_history (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    seeds_json TEXT NOT NULL,
                    direction TEXT NOT NULL,
                    max_depth INTEGER NOT NULL,
                    max_papers INTEGER NOT NULL,
                    node_count INTEGER NOT NULL,
                    edge_count INTEGER NOT NULL,
                    cancelled INTEGER NOT NULL DEFAULT 0,
                    compressed_bytes INTEGER NOT NULL,
                    data_zlib BLOB NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_crawl_history_created ON crawl_history(created_at DESC)"
            )
            conn.commit()

    def save_crawl(
        self,
        payload: GraphPayload,
        *,
        max_depth: int,
        max_papers: int,
    ) -> HistorySummary:
        """Compress payload with compact v2 + zlib and save to SQLite."""
        history_id = uuid.uuid4().hex[:12]
        created_at = datetime.now(timezone.utc).isoformat()
        blob = compress_zlib(payload)

        seed_nodes = [n for n in payload.nodes if n.is_seed]
        if seed_nodes:
            title = seed_nodes[0].title
            if len(seed_nodes) > 1:
                title = f"{title} (+{len(seed_nodes) - 1} seeds)"
        elif payload.nodes:
            title = payload.nodes[0].title
        else:
            title = ", ".join(payload.stats.seeds[:2]) or "Empty Crawl"

        title = title[:160]
        seeds_json = json.dumps(payload.stats.seeds, ensure_ascii=False)

        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO crawl_history (
                    id, title, seeds_json, direction, max_depth, max_papers,
                    node_count, edge_count, cancelled, compressed_bytes, data_zlib, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    history_id,
                    title,
                    seeds_json,
                    payload.stats.direction,
                    max_depth,
                    max_papers,
                    len(payload.nodes),
                    len(payload.edges),
                    1 if payload.stats.cancelled else 0,
                    len(blob),
                    sqlite3.Binary(blob),
                    created_at,
                ),
            )
            conn.commit()

        return HistorySummary(
            id=history_id,
            title=title,
            seeds=payload.stats.seeds,
            direction=payload.stats.direction,
            max_depth=max_depth,
            max_papers=max_papers,
            node_count=len(payload.nodes),
            edge_count=len(payload.edges),
            cancelled=payload.stats.cancelled,
            compressed_bytes=len(blob),
            created_at=created_at,
        )

    def list_history(self, limit: int = 50) -> list[HistorySummary]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, title, seeds_json, direction, max_depth, max_papers,
                       node_count, edge_count, cancelled, compressed_bytes, created_at
                FROM crawl_history
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()

        items: list[HistorySummary] = []
        for row in rows:
            items.append(
                HistorySummary(
                    id=row["id"],
                    title=row["title"],
                    seeds=json.loads(row["seeds_json"]),
                    direction=row["direction"],
                    max_depth=row["max_depth"],
                    max_papers=row["max_papers"],
                    node_count=row["node_count"],
                    edge_count=row["edge_count"],
                    cancelled=bool(row["cancelled"]),
                    compressed_bytes=row["compressed_bytes"],
                    created_at=row["created_at"],
                )
            )
        return items

    def get_crawl(self, history_id: str) -> GraphPayload | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT data_zlib FROM crawl_history WHERE id = ?",
                (history_id,),
            ).fetchone()
        if not row:
            return None
        return decompress_zlib(bytes(row["data_zlib"]))

    def get_crawl_gzip(self, history_id: str) -> tuple[bytes, str] | None:
        payload = self.get_crawl(history_id)
        if payload is None:
            return None
        gz_bytes = compress_gzip(payload)
        filename = f"doi-graph-{history_id}.json.gz"
        return gz_bytes, filename

    def delete_crawl(self, history_id: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute("DELETE FROM crawl_history WHERE id = ?", (history_id,))
            conn.commit()
            return cur.rowcount > 0
