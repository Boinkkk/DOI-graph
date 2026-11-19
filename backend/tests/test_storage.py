"""Unit tests for SQLite + zlib CrawlHistoryStore."""

from pathlib import Path

from app.models import GraphEdge, GraphPayload, GraphStats, PaperNode
from app.storage import CrawlHistoryStore


def test_sqlite_history_crud(tmp_path: Path) -> None:
    db_file = tmp_path / "test_history.db"
    store = CrawlHistoryStore(db_file)

    payload = GraphPayload(
        nodes=[
            PaperNode(doi="10.1000/1", title="First Seed", is_seed=True, depth=0, rank=1, pagerank=0.6),
            PaperNode(doi="10.1000/2", title="Ref Paper", is_seed=False, depth=1, rank=2, pagerank=0.4),
        ],
        edges=[GraphEdge(source="10.1000/1", target="10.1000/2")],
        stats=GraphStats(
            total_nodes=2,
            total_edges=1,
            max_depth_reached=1,
            direction="references",
            seeds=["10.1000/1"],
            cancelled=False,
        ),
    )

    summary = store.save_crawl(payload, max_depth=2, max_papers=100)
    assert summary.node_count == 2
    assert summary.edge_count == 1
    assert summary.compressed_bytes > 0

    listed = store.list_history()
    assert len(listed) == 1
    assert listed[0].id == summary.id

    loaded = store.get_crawl(summary.id)
    assert loaded is not None
    assert len(loaded.nodes) == 2
    assert loaded.edges[0].target == "10.1000/2"

    gz = store.get_crawl_gzip(summary.id)
    assert gz is not None
    gz_bytes, filename = gz
    assert filename.endswith(".json.gz")
    assert len(gz_bytes) > 0

    assert store.delete_crawl(summary.id) is True
    assert store.get_crawl(summary.id) is None
    assert store.list_history() == []
