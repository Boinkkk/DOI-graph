import type {
  CrawlDirection,
  CrawlProgress,
  GraphEdge,
  GraphPayload,
  HistorySummary,
  PaperNode,
} from '../types/graph';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export interface StreamCrawlCallbacks {
  onStarted?: (crawlId: string) => void;
  onStatus?: (progress: CrawlProgress) => void;
  onNode?: (node: PaperNode) => void;
  onEdge?: (edge: GraphEdge) => void;
  onProgress?: (progress: CrawlProgress) => void;
  onComplete?: (payload: GraphPayload, historyId?: string) => void;
  onError?: (message: string) => void;
}

export async function startCrawlStream(
  params: {
    seeds: string[];
    max_depth: number;
    max_papers: number;
    direction: CrawlDirection;
  },
  callbacks: StreamCrawlCallbacks,
  signal: AbortSignal
): Promise<void> {
  const response = await fetch(`${API_BASE}/api/crawl/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal,
  });

  if (!response.ok || !response.body) {
    const errText = await response.text().catch(() => '');
    throw new Error(errText || `HTTP ${response.status} gagal memulai crawl.`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const dispatchBlock = (block: string) => {
    const trimmed = block.trim();
    if (!trimmed) return;
    let eventName = 'message';
    const dataLines: string[] = [];

    for (const line of trimmed.split(/\r?\n/)) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (dataLines.length === 0) return;
    const rawJson = dataLines.join('\n');
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawJson) as Record<string, unknown>;
    } catch {
      return;
    }

    switch (eventName) {
      case 'started':
        if (typeof data.crawl_id === 'string') {
          callbacks.onStarted?.(data.crawl_id);
        }
        break;
      case 'status':
        callbacks.onStatus?.(data as unknown as CrawlProgress);
        break;
      case 'node':
        callbacks.onNode?.(data as unknown as PaperNode);
        break;
      case 'edge':
        callbacks.onEdge?.(data as unknown as GraphEdge);
        break;
      case 'progress':
        callbacks.onProgress?.(data as unknown as CrawlProgress);
        break;
      case 'complete': {
        const payload: GraphPayload = {
          nodes: (data.nodes as PaperNode[]) ?? [],
          edges: (data.edges as GraphEdge[]) ?? [],
          stats: data.stats as GraphPayload['stats'],
        };
        const historyId = typeof data.history_id === 'string' ? data.history_id : undefined;
        callbacks.onComplete?.(payload, historyId);
        break;
      }
      case 'error':
        callbacks.onError?.(
          typeof data.message === 'string' ? data.message : 'Terjadi kesalahan saat crawl.'
        );
        break;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIdx = buffer.indexOf('\n\n');
    while (sepIdx !== -1) {
      const block = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);
      dispatchBlock(block);
      sepIdx = buffer.indexOf('\n\n');
    }
  }

  if (buffer.trim()) {
    dispatchBlock(buffer);
  }
}

export async function cancelCrawl(crawlId: string): Promise<void> {
  await fetch(`${API_BASE}/api/crawl/${encodeURIComponent(crawlId)}/cancel`, {
    method: 'POST',
  }).catch(() => undefined);
}

export async function fetchHistory(): Promise<HistorySummary[]> {
  const res = await fetch(`${API_BASE}/api/history`);
  if (!res.ok) throw new Error('Gagal memuat riwayat crawl.');
  return (await res.json()) as HistorySummary[];
}

export async function loadHistoryItem(id: string): Promise<GraphPayload> {
  const res = await fetch(`${API_BASE}/api/history/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error('Gagal memuat detail riwayat.');
  return (await res.json()) as GraphPayload;
}

export function getHistoryDownloadUrl(id: string): string {
  return `${API_BASE}/api/history/${encodeURIComponent(id)}/download`;
}

export async function deleteHistoryItem(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/history/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Gagal menghapus riwayat.');
}
