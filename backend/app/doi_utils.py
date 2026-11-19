"""DOI normalization, validation, and seed parsing utilities."""

from __future__ import annotations

import re
from urllib.parse import unquote

_DOI_URL_RE = re.compile(r"^https?://(?:dx\.)?doi\.org/", re.IGNORECASE)
_DOI_PREFIX_RE = re.compile(r"^doi:\s*", re.IGNORECASE)
_DOI_VALID_RE = re.compile(r"^10\.\d{4,9}/[^\s]+$")
_SPLIT_RE = re.compile(r"[\s,;]+")


def normalize_doi(raw: str | None) -> str | None:
    """Normalize a DOI or DOI URL to lowercase canonical form without prefix.

    Returns None if the input cannot be normalized to a valid DOI.
    """
    if not raw or not isinstance(raw, str):
        return None

    value = raw.strip()
    if not value:
        return None

    is_url = bool(_DOI_URL_RE.match(value))
    value = _DOI_URL_RE.sub("", value)
    value = _DOI_PREFIX_RE.sub("", value)

    if is_url:
        value = value.split("?", 1)[0].split("#", 1)[0]
        value = unquote(value)

    value = value.strip().strip("\"'<>[]")
    # Strip trailing sentence punctuation often pasted with DOIs
    value = value.rstrip(".,;")
    value = value.lower()

    if not _DOI_VALID_RE.match(value):
        return None
    return value


def doi_to_url(doi: str) -> str:
    """Return canonical https://doi.org/ URL for a normalized DOI."""
    norm = normalize_doi(doi) or doi.strip().lower()
    return f"https://doi.org/{norm}"


def parse_seed_dois(raw: str | list[str]) -> list[str]:
    """Parse one or more DOIs/URLs into a deduplicated ordered list of normalized DOIs."""
    if isinstance(raw, str):
        tokens = _SPLIT_RE.split(raw.strip())
    else:
        tokens = []
        for item in raw:
            tokens.extend(_SPLIT_RE.split(str(item).strip()))

    seen: set[str] = set()
    result: list[str] = []
    for token in tokens:
        if not token:
            continue
        norm = normalize_doi(token)
        if norm and norm not in seen:
            seen.add(norm)
            result.append(norm)
    return result
