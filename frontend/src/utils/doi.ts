const DOI_URL_RE = /^https?:\/\/(?:dx\.)?doi\.org\//i;
const DOI_PREFIX_RE = /^doi:\s*/i;
const DOI_VALID_RE = /^10\.\d{4,9}\/[^\s]+$/;

export function normalizeDoi(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  let value = raw.trim();
  if (!value) return null;

  const isUrl = DOI_URL_RE.test(value);
  value = value.replace(DOI_URL_RE, '').replace(DOI_PREFIX_RE, '');

  if (isUrl) {
    value = value.split('?')[0].split('#')[0];
    try {
      value = decodeURIComponent(value);
    } catch {
      // ignore malformed URI sequence
    }
  }

  value = value
    .trim()
    .replace(/^["'<>[\]]+|["'<>[\]]+$/g, '')
    .replace(/[.,;]+$/, '')
    .toLowerCase();

  return DOI_VALID_RE.test(value) ? value : null;
}

export function parseSeedDois(raw: string): string[] {
  const tokens = raw.trim().split(/[\s,;]+/);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const token of tokens) {
    if (!token) continue;
    const norm = normalizeDoi(token);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      result.push(norm);
    }
  }
  return result;
}

export function doiToUrl(doi: string): string {
  const norm = normalizeDoi(doi) ?? doi.trim().toLowerCase();
  return `https://doi.org/${norm}`;
}
