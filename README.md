# DOI-Graph

Aplikasi web full-stack untuk memetakan, menelusuri, dan memvisualisasikan jaringan relasi sitasi antar-paper ilmiah secara interaktif berbasis link DOI, lengkap dengan algoritma **PageRank** berarah (`damping = 0.85`), streaming **Server-Sent Events (SSE)**, penyimpanan otomatis **SQLite + `zlib`**, dan format portabel **Compact v2 `.json.gz`**.

## Arsitektur

- **Backend (`backend/`)**: Python **FastAPI**, `httpx.AsyncClient` (OpenAlex primary, Semantic Scholar & Crossref fallback, `doi.org` redirect/handle fallback), BFS asinkron dengan `visited` set, SSE real-time + cancellation, PageRank berarah, dan SQLite + `zlib` auto-save.
- **Frontend (`frontend/`)**: React + TypeScript + Vite + Tailwind CSS + `react-force-graph-2d`, hover-only labels & tooltip detail, toolbar filter & pewarnaan, pagination 50 item/halaman pada Ranking & Paper Inspector, serta upload / drag & drop `.json` / `.json.gz` 100% client-side.

## Menjalankan Backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Menjalankan Unit Test Backend

```bash
cd backend
.venv\Scripts\pytest.exe -v
```

## Menjalankan Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend berjalan di `http://localhost:5173` dan mem-proxy `/api` ke `http://127.0.0.1:8000`.

### Verifikasi Build & Test Frontend

```bash
cd frontend
npm test
npm run build
```
