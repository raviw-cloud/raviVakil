# Adaptive RAG System — Design Spec
**Date:** 2026-05-04
**Status:** Approved
**Location:** `adaptive-rag/` subfolder under `VakiDeskWebApp/`

---

## 1. Problem Statement

Build a Python adaptive RAG (Retrieval-Augmented Generation) system for Indian legal documents that:
- Learns from new documents incrementally (no full re-index)
- Adjusts retrieval scores based on user feedback (thumbs up/down)
- Routes queries by complexity using LLM classification
- Monitors retrieval quality with MRR and feedback ratio metrics
- Ships as a deployable Streamlit app with example document ingestion

Prototype stage: single-user, local, no auth. Path to advocate-facing cloud version is planned but out of scope here.

---

## 2. Architecture

**Approach:** Modular pipeline with thin Streamlit UI layer.

Four standalone Python modules expose clean interfaces. Streamlit (`app.py`) is the only file that imports from multiple modules — it is the composition layer, not a logic layer.

```
VakiDeskWebApp/
└── adaptive-rag/
    ├── app.py                 ← Streamlit UI only
    ├── ingestion.py           ← PDF → chunks → embeddings → ChromaDB
    ├── retrieval.py           ← classify query → vector search → score adjustment
    ├── feedback.py            ← record thumbs, compute per-chunk weights
    ├── monitor.py             ← log sessions, compute MRR + feedback ratio
    ├── data/
    │   ├── chroma_db/         ← local ChromaDB persistent store
    │   └── feedback_log.jsonl ← append-only feedback records
    ├── sample_docs/           ← example Indian legal PDFs
    ├── requirements.txt
    └── README.md
```

**Data stores:**
- `chroma_db/` — ChromaDB embedded, persistent. Swap to Pinecone by replacing one class in `retrieval.py`.
- `feedback_log.jsonl` — append-only JSONL. Schema per line: `{query, chunk_id, thumb, timestamp}`.

---

## 3. Module Responsibilities

### `ingestion.py`
- Extract text from PDF using `pdfplumber`
- Split into ~500-token chunks with 50-token overlap
- Embed with `sentence-transformers` (`all-MiniLM-L6-v2`)
- Upsert to ChromaDB; chunk ID = `{filename}_{page}_{chunk_index}` (idempotent)
- Metadata stored per chunk: `source_file`, `page_number`, `chunk_index`
- Raises `IngestionError` for unreadable, empty, or scanned PDFs

### `retrieval.py`
- **Stage 1:** Call Claude Haiku to classify query as `simple` / `moderate` / `complex`
  - Simple → retrieve top-3 chunks
  - Moderate → retrieve top-5 chunks
  - Complex → retrieve top-7 chunks + cross-chunk re-ranking by score
- **Stage 2:** Multiply raw cosine similarity scores by per-chunk weights from `feedback.py`
- Return ranked list of `{chunk_text, source_file, page_number, adjusted_score}`
- Fallback: if Haiku call fails, default to `moderate` and log failure

### `feedback.py`
- `record(query, chunk_id, thumb)` → appends to `feedback_log.jsonl`
- `get_weights()` → reads log, computes weight per chunk:
  `weight = clamp(1 + (upvotes - downvotes) * 0.1, min=0.5, max=2.0)`
- Missing log file → treated as zero feedback; file created on first write
- Recomputed on every retrieval call (acceptable at prototype scale)

### `monitor.py`
- `log_session(query, complexity, chunks, latency_ms)` → appends to session log
- `get_metrics()` → returns:
  - **MRR (Mean Reciprocal Rank):** estimated from thumbs-up chunk positions across sessions
  - **Feedback ratio:** positive votes / total votes
- Streamlit sidebar reads `get_metrics()` and renders bar charts

---

## 4. Data Flow

### Ingestion (one-time or incremental)
```
PDF → pdfplumber extract → chunk + overlap → embed → ChromaDB upsert
```

### Query
```
User input
  → Haiku: classify complexity
  → ChromaDB: vector search → raw chunks + cosine scores
  → feedback.get_weights(): per-chunk multiplier
  → re-rank by adjusted score
  → return top-N to Streamlit
  → monitor.log_session()
```

### Feedback
```
User clicks 👍 or 👎
  → feedback.record(query, chunk_id, thumb)
  → appended to feedback_log.jsonl
  → next similar query picks up new weights automatically
```

### Monitoring (sidebar)
```
monitor.get_metrics() → MRR + feedback ratio → Streamlit bar charts
```

---

## 5. Error Handling

| Scenario | Behaviour |
|---|---|
| PDF unreadable / corrupted | Raise `IngestionError`; Streamlit shows user message |
| Scanned PDF (no text layer) | Raise `IngestionError("No extractable text — OCR not supported")` |
| Duplicate file re-upload | Idempotent upsert; no error, no duplicate chunks |
| Haiku classification fails | Fallback to `moderate`; log failure in monitor |
| Empty ChromaDB (no docs) | Return `[]` with message "No documents ingested yet" |
| `feedback_log.jsonl` missing | Treat as zero feedback; create on first write |

---

## 6. Constraints (Prototype Scope)

- Max PDF size: 10 MB (enforced by Streamlit uploader)
- Max chunk store: ~10,000 chunks (~200 typical contracts)
- No authentication — single-user local only
- No OCR — scanned PDFs rejected with clear message
- No retraining or re-embedding — feedback adjusts scores only
- Feedback weights reset if `feedback_log.jsonl` is deleted

---

## 7. Dependencies (`requirements.txt`)

```
streamlit
pdfplumber
sentence-transformers
chromadb
anthropic
```

---

## 8. Cloud Migration Path (future)

| Component | Prototype | Cloud version |
|---|---|---|
| Vector store | ChromaDB local | Pinecone / Weaviate |
| Embeddings | sentence-transformers local | OpenAI `text-embedding-3-small` |
| Feedback store | `feedback_log.jsonl` | Postgres table |
| Session log | local JSONL | Postgres / BigQuery |
| UI | Streamlit | FastAPI + React |
| Auth | None | Advocate login (JWT) |

---

## 9. Out of Scope

- OCR for scanned PDFs
- Multi-user support
- Fine-tuning any model on feedback
- Hindi / regional language document support
- Integration with existing VakiDeskWebApp Node.js server
