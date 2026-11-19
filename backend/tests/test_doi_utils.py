"""Unit tests for DOI normalization and seed parsing."""

from app.doi_utils import doi_to_url, normalize_doi, parse_seed_dois


def test_normalize_doi_variants() -> None:
    assert normalize_doi("https://doi.org/10.1038/S41586-021-03819-2") == "10.1038/s41586-021-03819-2"
    assert normalize_doi("http://dx.doi.org/10.1126/science.abc1234?ref=x#sec1") == "10.1126/science.abc1234"
    assert normalize_doi("doi: 10.1000/182.") == "10.1000/182"
    assert normalize_doi("  10.1145/3292500.3330919, ") == "10.1145/3292500.3330919"
    assert normalize_doi("not-a-doi") is None
    assert normalize_doi("") is None
    assert normalize_doi(None) is None


def test_doi_to_url() -> None:
    assert doi_to_url("HTTPS://DOI.ORG/10.1038/Nature123") == "https://doi.org/10.1038/nature123"


def test_parse_seed_dois_deduplicates_and_preserves_order() -> None:
    raw = """
    https://doi.org/10.1038/a1
    10.1038/A1, 10.1126/b2; doi:10.1000/c3
    invalid_token
    """
    assert parse_seed_dois(raw) == ["10.1038/a1", "10.1126/b2", "10.1000/c3"]
