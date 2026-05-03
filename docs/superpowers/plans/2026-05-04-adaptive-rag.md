# Adaptive RAG System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a modular adaptive RAG system for Indian legal documents as a Streamlit app under `adaptive-rag/`.

**Architecture:** Four standalone Python modules (ingestion, feedback, monitor, retrieval) with clean interfaces; `app.py` is the thin Streamlit UI layer that composes them. ChromaDB runs embedded locally; swapping to a cloud vector store requires changing one class in `retrieval.py`.

**Tech Stack:** Python 3.11+, pdfplumber, sentence-transformers (all-MiniLM-L6-v2), chromadb, anthropic (claude-haiku-4-5-20251001), streamlit, pytest

---

## File Map

| File | Responsibility |
|---|---|
| `adaptive-rag/ingestion.py` | PDF → chunks → embeddings → ChromaDB upsert |
| `adaptive-rag/feedback.py` | Record thumbs, compute per-chunk score weights |
| `adaptive-rag/monitor.py` | Log retrieval sessions, compute MRR + feedback ratio |
| `adaptive-rag/retrieval.py` | LLM classify query → vector search → score adjustment |
| `adaptive-rag/app.py` | Streamlit UI: ingestion tab, query tab, monitoring sidebar |
| `adaptive-rag/requirements.txt` | Python dependencies |
| `adaptive-rag/tests/test_ingestion.py` | Tests for chunking and ingestion logic |
| `adaptive-rag/tests/test_feedback.py` | Tests for feedback record and weight computation |
| `adaptive-rag/tests/test_monitor.py` | Tests for session logging and metric calculation |
| `adaptive-rag/tests/test_retrieval.py` | Tests for query classification and retrieve fallbacks |
| `adaptive-rag/sample_docs/README.md` | Instructions for adding sample Indian legal PDFs |

---

## Task 1: Project Scaffold

**Files:**
- Create: `adaptive-rag/requirements.txt`
- Create: `adaptive-rag/.env.example`
- Create: `adaptive-rag/data/.gitkeep`
- Create: `adaptive-rag/sample_docs/README.md`
- Create: `adaptive-rag/tests/__init__.py`

- [ ] **Step 1: Create the folder structure**

```bash
mkdir -p adaptive-rag/data adaptive-rag/tests adaptive-rag/sample_docs
touch adaptive-rag/tests/__init__.py adaptive-rag/data/.gitkeep
```

- [ ] **Step 2: Write `adaptive-rag/requirements.txt`**

```
streamlit>=1.35.0
pdfplumber>=0.11.0
sentence-transformers>=3.0.0
chromadb>=0.5.0
anthropic>=0.28.0
pytest>=8.0.0
pytest-mock>=3.14.0
```

- [ ] **Step 3: Write `adaptive-rag/.env.example`**

```
ANTHROPIC_API_KEY=your_key_here
```

- [ ] **Step 4: Write `adaptive-rag/sample_docs/README.md`**

```markdown
# Sample Documents

Place Indian legal PDF files here to demo ingestion.

Suitable documents:
- Rent agreements
- Service agreements
- Non-disclosure agreements
- Employment contracts

Files must have a selectable text layer (not scanned images).
Maximum file size: 10 MB per file.
```

- [ ] **Step 5: Install dependencies**

```bash
cd adaptive-rag
pip install -r requirements.txt
```

Expected: packages install without errors. `sentence-transformers` will download the `all-MiniLM-L6-v2` model on first use (~90 MB).

- [ ] **Step 6: Commit**

```bash
git add adaptive-rag/
git commit -m "feat: scaffold adaptive-rag project structure"
```

---

## Task 2: `ingestion.py` — Chunking

**Files:**
- Create: `adaptive-rag/ingestion.py`
- Create: `adaptive-rag/tests/test_ingestion.py`

- [ ] **Step 1: Write the failing tests for `_chunk_text`**

Create `adaptive-rag/tests/test_ingestion.py`:

```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from ingestion import _chunk_text, IngestionError


def test_chunk_text_basic_split():
    words = ["word"] * 600
    text = " ".join(words)
    chunks = _chunk_text(text, chunk_size=500, overlap=50)
    assert len(chunks) == 2
    assert chunks[0].count("word") == 500


def test_chunk_text_overlap():
    words = list(map(str, range(600)))
    text = " ".join(words)
    chunks = _chunk_text(text, chunk_size=500, overlap=50)
    # Second chunk starts at index 450 (500 - 50)
    first_word_of_second = chunks[1].split()[0]
    assert first_word_of_second == "450"


def test_chunk_text_small_input():
    text = "short text"
    chunks = _chunk_text(text, chunk_size=500, overlap=50)
    assert len(chunks) == 1
    assert chunks[0] == "short text"


def test_chunk_text_empty_string():
    chunks = _chunk_text("", chunk_size=500, overlap=50)
    assert chunks == [] or all(not c.strip() for c in chunks)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd adaptive-rag
pytest tests/test_ingestion.py -v
```

Expected: `ImportError` or `ModuleNotFoundError` — `ingestion` not yet defined.

- [ ] **Step 3: Write `adaptive-rag/ingestion.py` — chunking only**

```python
from pathlib import Path

CHUNK_SIZE = 500
CHUNK_OVERLAP = 50
CHROMA_PATH = Path(__file__).parent / "data" / "chroma_db"


class IngestionError(Exception):
    pass


def _chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    words = text.split()
    if not words:
        return []
    chunks = []
    start = 0
    while start < len(words):
        end = start + chunk_size
        chunks.append(" ".join(words[start:end]))
        if end >= len(words):
            break
        start += chunk_size - overlap
    return chunks
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_ingestion.py::test_chunk_text_basic_split tests/test_ingestion.py::test_chunk_text_overlap tests/test_ingestion.py::test_chunk_text_small_input tests/test_ingestion.py::test_chunk_text_empty_string -v
```

Expected: 4 PASSED.

- [ ] **Step 5: Commit**

```bash
git add adaptive-rag/ingestion.py adaptive-rag/tests/test_ingestion.py
git commit -m "feat: add ingestion chunking logic with tests"
```

---

## Task 3: `ingestion.py` — PDF Parsing and ChromaDB Upsert

**Files:**
- Modify: `adaptive-rag/ingestion.py`
- Modify: `adaptive-rag/tests/test_ingestion.py`

- [ ] **Step 1: Write failing tests for `ingest_pdf`**

Append to `adaptive-rag/tests/test_ingestion.py`:

```python
import pytest
from unittest.mock import patch, MagicMock


def test_ingest_pdf_raises_on_unreadable_file():
    with pytest.raises(IngestionError, match="Cannot read PDF"):
        ingest_pdf("/nonexistent/path/file.pdf")


def test_ingest_pdf_raises_on_empty_text(tmp_path):
    fake_pdf = tmp_path / "empty.pdf"
    fake_pdf.write_bytes(b"%PDF-1.4 fake")

    mock_page = MagicMock()
    mock_page.extract_text.return_value = ""

    with patch("ingestion.pdfplumber.open") as mock_open:
        mock_open.return_value.__enter__.return_value.pages = [mock_page]
        with pytest.raises(IngestionError, match="No extractable text"):
            ingest_pdf(str(fake_pdf))


def test_ingest_pdf_returns_chunk_count(tmp_path):
    fake_pdf = tmp_path / "contract.pdf"
    fake_pdf.write_bytes(b"%PDF-1.4 fake")

    mock_page = MagicMock()
    mock_page.extract_text.return_value = " ".join(["clause"] * 100)

    mock_collection = MagicMock()
    mock_collection.get.return_value = {"ids": []}

    with patch("ingestion.pdfplumber.open") as mock_open, \
         patch("ingestion._get_collection", return_value=mock_collection), \
         patch("ingestion._get_model") as mock_model:
        mock_open.return_value.__enter__.return_value.pages = [mock_page]
        mock_model.return_value.encode.return_value = [0.1] * 384
        count = ingest_pdf(str(fake_pdf))

    assert count >= 1
    assert mock_collection.add.called
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_ingestion.py::test_ingest_pdf_raises_on_unreadable_file tests/test_ingestion.py::test_ingest_pdf_raises_on_empty_text tests/test_ingestion.py::test_ingest_pdf_returns_chunk_count -v
```

Expected: FAILED — `ingest_pdf` not defined.

- [ ] **Step 3: Complete `adaptive-rag/ingestion.py`**

```python
from pathlib import Path
import pdfplumber
from sentence_transformers import SentenceTransformer
import chromadb

CHUNK_SIZE = 500
CHUNK_OVERLAP = 50
CHROMA_PATH = Path(__file__).parent / "data" / "chroma_db"

_model = None
_client = None
_collection = None


class IngestionError(Exception):
    pass


def _chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    words = text.split()
    if not words:
        return []
    chunks = []
    start = 0
    while start < len(words):
        end = start + chunk_size
        chunks.append(" ".join(words[start:end]))
        if end >= len(words):
            break
        start += chunk_size - overlap
    return chunks


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def _get_collection():
    global _client, _collection
    if _collection is None:
        CHROMA_PATH.mkdir(parents=True, exist_ok=True)
        _client = chromadb.PersistentClient(path=str(CHROMA_PATH))
        _collection = _client.get_or_create_collection(
            name="legal_docs",
            metadata={"hnsw:space": "cosine"}
        )
    return _collection


def ingest_pdf(pdf_path: str) -> int:
    path = Path(pdf_path)
    try:
        with pdfplumber.open(pdf_path) as pdf:
            pages = [(i + 1, page.extract_text() or "") for i, page in enumerate(pdf.pages)]
    except Exception as e:
        raise IngestionError(f"Cannot read PDF: {e}")

    full_text = " ".join(text for _, text in pages if text.strip())
    if not full_text.strip():
        raise IngestionError(
            "No extractable text — PDF may be scanned. OCR not supported in this version."
        )

    collection = _get_collection()
    model = _get_model()
    filename = path.name
    chunks_added = 0
    chunk_index = 0

    for page_num, page_text in pages:
        if not page_text.strip():
            continue
        for chunk in _chunk_text(page_text):
            if not chunk.strip():
                continue
            chunk_id = f"{filename}_{page_num}_{chunk_index}"
            existing = collection.get(ids=[chunk_id])
            if not existing["ids"]:
                embedding = model.encode(chunk).tolist()
                collection.add(
                    ids=[chunk_id],
                    embeddings=[embedding],
                    documents=[chunk],
                    metadatas=[{
                        "source_file": filename,
                        "page_number": page_num,
                        "chunk_index": chunk_index,
                    }],
                )
                chunks_added += 1
            chunk_index += 1

    return chunks_added
```

- [ ] **Step 4: Run all ingestion tests**

```bash
pytest tests/test_ingestion.py -v
```

Expected: 7 PASSED.

- [ ] **Step 5: Commit**

```bash
git add adaptive-rag/ingestion.py adaptive-rag/tests/test_ingestion.py
git commit -m "feat: complete ingestion module — PDF parsing and ChromaDB upsert"
```

---

## Task 4: `feedback.py` — Record and Weight Computation

**Files:**
- Create: `adaptive-rag/feedback.py`
- Create: `adaptive-rag/tests/test_feedback.py`

- [ ] **Step 1: Write failing tests**

Create `adaptive-rag/tests/test_feedback.py`:

```python
import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest


def test_record_appends_to_file(tmp_path, monkeypatch):
    import feedback
    monkeypatch.setattr(feedback, "FEEDBACK_LOG", tmp_path / "feedback_log.jsonl")

    feedback.record("what is clause 4", "contract_1_1_0", "up")
    feedback.record("what is clause 4", "contract_1_1_1", "down")

    lines = (tmp_path / "feedback_log.jsonl").read_text().strip().split("\n")
    assert len(lines) == 2
    entry = json.loads(lines[0])
    assert entry["chunk_id"] == "contract_1_1_0"
    assert entry["thumb"] == "up"
    assert "timestamp" in entry


def test_get_weights_missing_file(tmp_path, monkeypatch):
    import feedback
    monkeypatch.setattr(feedback, "FEEDBACK_LOG", tmp_path / "no_file.jsonl")

    weights = feedback.get_weights()
    assert weights == {}


def test_get_weights_computes_correctly(tmp_path, monkeypatch):
    import feedback
    log = tmp_path / "feedback_log.jsonl"
    monkeypatch.setattr(feedback, "FEEDBACK_LOG", log)

    # 3 ups, 1 down for chunk_a → weight = 1 + (3-1)*0.1 = 1.2
    for _ in range(3):
        feedback.record("q", "chunk_a", "up")
    feedback.record("q", "chunk_a", "down")

    weights = feedback.get_weights()
    assert abs(weights["chunk_a"] - 1.2) < 0.001


def test_get_weights_clamp_min(tmp_path, monkeypatch):
    import feedback
    log = tmp_path / "feedback_log.jsonl"
    monkeypatch.setattr(feedback, "FEEDBACK_LOG", log)

    # 20 downs → raw = 1 + (0-20)*0.1 = -1.0, clamped to 0.5
    for _ in range(20):
        feedback.record("q", "chunk_b", "down")

    weights = feedback.get_weights()
    assert weights["chunk_b"] == 0.5


def test_get_weights_clamp_max(tmp_path, monkeypatch):
    import feedback
    log = tmp_path / "feedback_log.jsonl"
    monkeypatch.setattr(feedback, "FEEDBACK_LOG", log)

    # 20 ups → raw = 1 + 20*0.1 = 3.0, clamped to 2.0
    for _ in range(20):
        feedback.record("q", "chunk_c", "up")

    weights = feedback.get_weights()
    assert weights["chunk_c"] == 2.0
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_feedback.py -v
```

Expected: FAILED — `feedback` module not defined.

- [ ] **Step 3: Write `adaptive-rag/feedback.py`**

```python
import json
from datetime import datetime, timezone
from pathlib import Path

FEEDBACK_LOG = Path(__file__).parent / "data" / "feedback_log.jsonl"


def record(query: str, chunk_id: str, thumb: str) -> None:
    FEEDBACK_LOG.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "query": query,
        "chunk_id": chunk_id,
        "thumb": thumb,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    with open(FEEDBACK_LOG, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")


def get_weights() -> dict[str, float]:
    if not FEEDBACK_LOG.exists():
        return {}

    counts: dict[str, dict[str, int]] = {}
    with open(FEEDBACK_LOG, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            entry = json.loads(line)
            cid = entry["chunk_id"]
            if cid not in counts:
                counts[cid] = {"up": 0, "down": 0}
            counts[cid][entry["thumb"]] += 1

    weights: dict[str, float] = {}
    for cid, c in counts.items():
        raw = 1.0 + (c["up"] - c["down"]) * 0.1
        weights[cid] = max(0.5, min(2.0, raw))
    return weights
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_feedback.py -v
```

Expected: 5 PASSED.

- [ ] **Step 5: Commit**

```bash
git add adaptive-rag/feedback.py adaptive-rag/tests/test_feedback.py
git commit -m "feat: add feedback module — record and weight computation"
```

---

## Task 5: `monitor.py` — Session Logging and Metrics

**Files:**
- Create: `adaptive-rag/monitor.py`
- Create: `adaptive-rag/tests/test_monitor.py`

- [ ] **Step 1: Write failing tests**

Create `adaptive-rag/tests/test_monitor.py`:

```python
import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))


def test_log_session_appends(tmp_path, monkeypatch):
    import monitor
    monkeypatch.setattr(monitor, "SESSION_LOG", tmp_path / "session_log.jsonl")

    chunks = [{"chunk_id": "c1"}, {"chunk_id": "c2"}]
    monitor.log_session("who signed?", "simple", chunks, 120.5)

    lines = (tmp_path / "session_log.jsonl").read_text().strip().split("\n")
    assert len(lines) == 1
    entry = json.loads(lines[0])
    assert entry["query"] == "who signed?"
    assert entry["complexity"] == "simple"
    assert entry["chunk_ids"] == ["c1", "c2"]
    assert entry["latency_ms"] == 120.5


def test_get_metrics_empty_log(tmp_path, monkeypatch):
    import monitor, feedback
    monkeypatch.setattr(monitor, "SESSION_LOG", tmp_path / "session_log.jsonl")
    monkeypatch.setattr(feedback, "FEEDBACK_LOG", tmp_path / "feedback_log.jsonl")

    metrics = monitor.get_metrics()
    assert metrics["mrr"] == 0.0
    assert metrics["feedback_ratio"] == 0.0
    assert metrics["total_queries"] == 0
    assert metrics["total_votes"] == 0


def test_get_metrics_mrr_computation(tmp_path, monkeypatch):
    import monitor, feedback
    session_log = tmp_path / "session_log.jsonl"
    fb_log = tmp_path / "feedback_log.jsonl"
    monkeypatch.setattr(monitor, "SESSION_LOG", session_log)
    monkeypatch.setattr(feedback, "FEEDBACK_LOG", fb_log)

    # Session: chunks [c1, c2, c3]; user upvotes c2 (rank 2 → reciprocal = 0.5)
    chunks = [{"chunk_id": "c1"}, {"chunk_id": "c2"}, {"chunk_id": "c3"}]
    monitor.log_session("query", "moderate", chunks, 200.0)
    feedback.record("query", "c2", "up")

    metrics = monitor.get_metrics()
    assert abs(metrics["mrr"] - 0.5) < 0.001
    assert metrics["feedback_ratio"] == 1.0
    assert metrics["total_votes"] == 1
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_monitor.py -v
```

Expected: FAILED — `monitor` module not defined.

- [ ] **Step 3: Write `adaptive-rag/monitor.py`**

```python
import json
from datetime import datetime, timezone
from pathlib import Path

SESSION_LOG = Path(__file__).parent / "data" / "session_log.jsonl"


def log_session(query: str, complexity: str, chunks: list[dict], latency_ms: float) -> None:
    SESSION_LOG.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "query": query,
        "complexity": complexity,
        "chunk_ids": [c["chunk_id"] for c in chunks],
        "latency_ms": latency_ms,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    with open(SESSION_LOG, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")


def get_metrics() -> dict:
    import feedback as fb

    if not SESSION_LOG.exists():
        return {"mrr": 0.0, "feedback_ratio": 0.0, "total_queries": 0, "total_votes": 0}

    sessions = []
    with open(SESSION_LOG, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                sessions.append(json.loads(line))

    fb_log = fb.FEEDBACK_LOG
    feedback_records = []
    if fb_log.exists():
        with open(fb_log, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    feedback_records.append(json.loads(line))

    upvoted = {r["chunk_id"] for r in feedback_records if r["thumb"] == "up"}
    total_votes = len(feedback_records)
    positive_votes = sum(1 for r in feedback_records if r["thumb"] == "up")

    reciprocal_ranks = []
    for session in sessions:
        for rank, chunk_id in enumerate(session["chunk_ids"], start=1):
            if chunk_id in upvoted:
                reciprocal_ranks.append(1.0 / rank)
                break

    mrr = sum(reciprocal_ranks) / len(reciprocal_ranks) if reciprocal_ranks else 0.0
    feedback_ratio = positive_votes / total_votes if total_votes > 0 else 0.0

    return {
        "mrr": round(mrr, 3),
        "feedback_ratio": round(feedback_ratio, 3),
        "total_queries": len(sessions),
        "total_votes": total_votes,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_monitor.py -v
```

Expected: 3 PASSED.

- [ ] **Step 5: Commit**

```bash
git add adaptive-rag/monitor.py adaptive-rag/tests/test_monitor.py
git commit -m "feat: add monitor module — session logging and MRR metrics"
```

---

## Task 6: `retrieval.py` — Query Classification

**Files:**
- Create: `adaptive-rag/retrieval.py`
- Create: `adaptive-rag/tests/test_retrieval.py`

- [ ] **Step 1: Write failing tests for `classify_query`**

Create `adaptive-rag/tests/test_retrieval.py`:

```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from unittest.mock import patch, MagicMock
from retrieval import classify_query


def test_classify_query_returns_simple():
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text="simple")]

    with patch("retrieval._get_anthropic") as mock_anthropic:
        mock_anthropic.return_value.messages.create.return_value = mock_response
        result = classify_query("Who are the parties?")

    assert result == "simple"


def test_classify_query_returns_complex():
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text="complex")]

    with patch("retrieval._get_anthropic") as mock_anthropic:
        mock_anthropic.return_value.messages.create.return_value = mock_response
        result = classify_query("Analyse all indemnity and force majeure clauses and their interaction")

    assert result == "complex"


def test_classify_query_fallback_on_api_error():
    with patch("retrieval._get_anthropic") as mock_anthropic:
        mock_anthropic.return_value.messages.create.side_effect = Exception("API down")
        result = classify_query("any query")

    assert result == "moderate"


def test_classify_query_fallback_on_unknown_response():
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text="very complex indeed")]

    with patch("retrieval._get_anthropic") as mock_anthropic:
        mock_anthropic.return_value.messages.create.return_value = mock_response
        result = classify_query("some query")

    assert result == "moderate"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_retrieval.py -v
```

Expected: FAILED — `retrieval` module not defined.

- [ ] **Step 3: Write `adaptive-rag/retrieval.py` — classification only**

```python
import time
from pathlib import Path
from anthropic import Anthropic
from sentence_transformers import SentenceTransformer
import chromadb

import feedback
import monitor

CHROMA_PATH = Path(__file__).parent / "data" / "chroma_db"
COMPLEXITY_TOP_N = {"simple": 3, "moderate": 5, "complex": 7}

_model = None
_chroma_client = None
_collection = None
_anthropic = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def _get_collection():
    global _chroma_client, _collection
    if _collection is None:
        CHROMA_PATH.mkdir(parents=True, exist_ok=True)
        _chroma_client = chromadb.PersistentClient(path=str(CHROMA_PATH))
        _collection = _chroma_client.get_or_create_collection(
            name="legal_docs",
            metadata={"hnsw:space": "cosine"},
        )
    return _collection


def _get_anthropic() -> Anthropic:
    global _anthropic
    if _anthropic is None:
        _anthropic = Anthropic()
    return _anthropic


def classify_query(query: str) -> str:
    try:
        response = _get_anthropic().messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=10,
            system=(
                "Classify the legal query complexity. "
                "Reply with exactly one word: simple, moderate, or complex."
            ),
            messages=[{"role": "user", "content": query}],
        )
        classification = response.content[0].text.strip().lower()
        if classification in COMPLEXITY_TOP_N:
            return classification
        return "moderate"
    except Exception:
        return "moderate"
```

- [ ] **Step 4: Run classification tests**

```bash
pytest tests/test_retrieval.py::test_classify_query_returns_simple tests/test_retrieval.py::test_classify_query_returns_complex tests/test_retrieval.py::test_classify_query_fallback_on_api_error tests/test_retrieval.py::test_classify_query_fallback_on_unknown_response -v
```

Expected: 4 PASSED.

- [ ] **Step 5: Commit**

```bash
git add adaptive-rag/retrieval.py adaptive-rag/tests/test_retrieval.py
git commit -m "feat: add retrieval module — LLM query classification"
```

---

## Task 7: `retrieval.py` — Vector Search and Score Adjustment

**Files:**
- Modify: `adaptive-rag/retrieval.py`
- Modify: `adaptive-rag/tests/test_retrieval.py`

- [ ] **Step 1: Write failing tests for `retrieve`**

Append to `adaptive-rag/tests/test_retrieval.py`:

```python
from retrieval import retrieve


def test_retrieve_returns_empty_for_empty_collection():
    mock_collection = MagicMock()
    mock_collection.count.return_value = 0

    with patch("retrieval._get_collection", return_value=mock_collection), \
         patch("retrieval.classify_query", return_value="moderate"):
        result = retrieve("any query")

    assert result == []


def test_retrieve_applies_feedback_weight():
    mock_collection = MagicMock()
    mock_collection.count.return_value = 2
    mock_collection.query.return_value = {
        "ids": [["file_1_0", "file_1_1"]],
        "documents": [["chunk text A", "chunk text B"]],
        "metadatas": [[
            {"source_file": "file.pdf", "page_number": 1, "chunk_index": 0},
            {"source_file": "file.pdf", "page_number": 1, "chunk_index": 1},
        ]],
        "distances": [[0.2, 0.3]],  # cosine distances; scores = 0.8 and 0.7
    }

    # chunk file_1_0 has weight 2.0 (many upvotes), file_1_1 has weight 1.0 (default)
    with patch("retrieval._get_collection", return_value=mock_collection), \
         patch("retrieval._get_model") as mock_model, \
         patch("retrieval.classify_query", return_value="moderate"), \
         patch("retrieval.feedback.get_weights", return_value={"file_1_0": 2.0}), \
         patch("retrieval.monitor.log_session"):
        mock_model.return_value.encode.return_value = [0.1] * 384
        result = retrieve("some query")

    assert len(result) == 2
    # file_1_0: score = (1-0.2) * 2.0 = 1.6
    # file_1_1: score = (1-0.3) * 1.0 = 0.7
    assert result[0]["chunk_id"] == "file_1_0"
    assert abs(result[0]["adjusted_score"] - 1.6) < 0.01
    assert result[1]["chunk_id"] == "file_1_1"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_retrieval.py::test_retrieve_returns_empty_for_empty_collection tests/test_retrieval.py::test_retrieve_applies_feedback_weight -v
```

Expected: FAILED — `retrieve` not defined.

- [ ] **Step 3: Add `retrieve` function to `adaptive-rag/retrieval.py`**

Append to the bottom of `retrieval.py` (after `classify_query`):

```python
def retrieve(query: str) -> list[dict]:
    start = time.time()
    complexity = classify_query(query)
    top_n = COMPLEXITY_TOP_N[complexity]

    collection = _get_collection()
    if collection.count() == 0:
        return []

    model = _get_model()
    embedding = model.encode(query).tolist()

    results = collection.query(
        query_embeddings=[embedding],
        n_results=min(top_n, collection.count()),
        include=["documents", "metadatas", "distances"],
    )

    weights = feedback.get_weights()

    chunks = []
    for i, chunk_id in enumerate(results["ids"][0]):
        cosine_score = 1.0 - results["distances"][0][i]
        weight = weights.get(chunk_id, 1.0)
        adjusted_score = cosine_score * weight
        chunks.append({
            "chunk_id": chunk_id,
            "chunk_text": results["documents"][0][i],
            "source_file": results["metadatas"][0][i]["source_file"],
            "page_number": results["metadatas"][0][i]["page_number"],
            "adjusted_score": round(adjusted_score, 4),
        })

    chunks.sort(key=lambda x: x["adjusted_score"], reverse=True)
    latency_ms = (time.time() - start) * 1000
    monitor.log_session(query, complexity, chunks, latency_ms)

    return chunks
```

- [ ] **Step 4: Run all retrieval tests**

```bash
pytest tests/test_retrieval.py -v
```

Expected: 6 PASSED.

- [ ] **Step 5: Commit**

```bash
git add adaptive-rag/retrieval.py adaptive-rag/tests/test_retrieval.py
git commit -m "feat: complete retrieval — vector search with feedback score adjustment"
```

---

## Task 8: `app.py` — Ingestion Tab

**Files:**
- Create: `adaptive-rag/app.py`

- [ ] **Step 1: Write `adaptive-rag/app.py` — ingestion tab only**

```python
import streamlit as st
import tempfile
import os
from pathlib import Path

import ingestion
import retrieval
import feedback
import monitor

st.set_page_config(page_title="Adaptive Legal RAG", layout="wide")
st.title("Adaptive Legal RAG")
st.caption("Indian legal documents — learns from your feedback")

tab_ingest, tab_query, tab_monitor = st.tabs(["Ingest Documents", "Query", "Monitor"])

# ── Ingestion Tab ──────────────────────────────────────────────────────────────
with tab_ingest:
    st.header("Ingest Legal Documents")
    st.write("Upload PDF files with a selectable text layer. Max 10 MB per file.")

    uploaded_files = st.file_uploader(
        "Choose PDF files",
        type=["pdf"],
        accept_multiple_files=True,
    )

    if uploaded_files and st.button("Ingest Selected Files"):
        for uploaded_file in uploaded_files:
            if uploaded_file.size > 10 * 1024 * 1024:
                st.error(f"{uploaded_file.name}: exceeds 10 MB limit — skipped.")
                continue

            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
                tmp.write(uploaded_file.read())
                tmp_path = tmp.name

            try:
                with st.spinner(f"Ingesting {uploaded_file.name}…"):
                    count = ingestion.ingest_pdf(tmp_path)
                st.success(f"{uploaded_file.name}: {count} new chunks added.")
            except ingestion.IngestionError as e:
                st.error(f"{uploaded_file.name}: {e}")
            finally:
                os.unlink(tmp_path)

# ── Query Tab (placeholder rendered in Task 9) ─────────────────────────────────
with tab_query:
    st.info("Query tab — implemented in next task.")

# ── Monitor Tab (placeholder rendered in Task 10) ─────────────────────────────
with tab_monitor:
    st.info("Monitor tab — implemented in next task.")
```

- [ ] **Step 2: Start the app and verify ingestion tab renders**

```bash
cd adaptive-rag
ANTHROPIC_API_KEY=your_key streamlit run app.py
```

Open `http://localhost:8501`. You should see:
- Three tabs: "Ingest Documents", "Query", "Monitor"
- File uploader accepting PDF files
- "Query tab" and "Monitor tab" show placeholder info boxes

Upload one of the PDFs from `sample_docs/` and click "Ingest Selected Files". Confirm the success message shows a chunk count > 0.

- [ ] **Step 3: Commit**

```bash
git add adaptive-rag/app.py
git commit -m "feat: add Streamlit ingestion tab"
```

---

## Task 9: `app.py` — Query and Feedback Tab

**Files:**
- Modify: `adaptive-rag/app.py`

- [ ] **Step 1: Replace the query tab placeholder in `app.py`**

Replace the block:
```python
# ── Query Tab (placeholder rendered in Task 9) ─────────────────────────────────
with tab_query:
    st.info("Query tab — implemented in next task.")
```

With:
```python
# ── Query Tab ─────────────────────────────────────────────────────────────────
with tab_query:
    st.header("Ask a Question")

    query = st.text_input(
        "Enter your legal question",
        placeholder="e.g. What are the termination conditions?",
    )

    if st.button("Search", disabled=not query):
        if not query.strip():
            st.warning("Please enter a question.")
        else:
            with st.spinner("Retrieving relevant clauses…"):
                results = retrieval.retrieve(query)

            if not results:
                st.warning(
                    "No results found. Ingest some documents first, or try a different query."
                )
            else:
                st.session_state["last_query"] = query
                st.session_state["last_results"] = results

    if "last_results" in st.session_state:
        results = st.session_state["last_results"]
        q = st.session_state["last_query"]
        st.subheader(f"{len(results)} clause(s) retrieved")

        for chunk in results:
            with st.expander(
                f"**{chunk['source_file']}** — Page {chunk['page_number']} "
                f"(score: {chunk['adjusted_score']})"
            ):
                st.write(chunk["chunk_text"])
                col_up, col_down, _ = st.columns([1, 1, 8])
                with col_up:
                    if st.button("👍", key=f"up_{chunk['chunk_id']}"):
                        feedback.record(q, chunk["chunk_id"], "up")
                        st.success("Recorded")
                with col_down:
                    if st.button("👎", key=f"down_{chunk['chunk_id']}"):
                        feedback.record(q, chunk["chunk_id"], "down")
                        st.success("Recorded")
```

- [ ] **Step 2: Reload the app and test the query flow**

In the browser at `http://localhost:8501`:
1. Switch to the "Query" tab
2. Enter: `What are the payment terms?`
3. Click "Search"
4. Verify chunks appear in expanders showing source file and page number
5. Click 👍 on one result — confirm "Recorded" appears
6. Click 👎 on another — confirm "Recorded" appears
7. Search again with the same query — the 👍 chunk should appear with a higher score than before

- [ ] **Step 3: Commit**

```bash
git add adaptive-rag/app.py
git commit -m "feat: add query and feedback UI tab"
```

---

## Task 10: `app.py` — Monitoring Sidebar

**Files:**
- Modify: `adaptive-rag/app.py`

- [ ] **Step 1: Replace monitor tab placeholder and add sidebar in `app.py`**

Replace:
```python
# ── Monitor Tab (placeholder rendered in Task 10) ─────────────────────────────
with tab_monitor:
    st.info("Monitor tab — implemented in next task.")
```

With:
```python
# ── Monitor Tab ───────────────────────────────────────────────────────────────
with tab_monitor:
    st.header("Retrieval Quality Monitor")
    metrics = monitor.get_metrics()

    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Total Queries", metrics["total_queries"])
    col2.metric("Total Votes", metrics["total_votes"])
    col3.metric("MRR", f"{metrics['mrr']:.3f}")
    col4.metric("Feedback Ratio", f"{metrics['feedback_ratio']:.1%}")

    st.markdown("---")
    st.subheader("Metric Definitions")
    st.markdown(
        "**MRR (Mean Reciprocal Rank):** Average of 1/rank of the first upvoted chunk across sessions. "
        "1.0 = always retrieved first; 0.5 = on average ranked second.\n\n"
        "**Feedback Ratio:** Fraction of votes that are positive (👍 / total votes). "
        "Above 0.7 is good; below 0.4 suggests retrieval quality problems."
    )

    if metrics["total_queries"] == 0:
        st.info("No sessions yet. Run some queries to see metrics.")
```

- [ ] **Step 2: Reload the app and verify the monitor tab**

In the browser:
1. Switch to the "Monitor" tab
2. After running queries and submitting feedback in Task 9, confirm:
   - "Total Queries" shows a non-zero count
   - "Total Votes" reflects the number of thumbs submitted
   - MRR is > 0 if any 👍 was submitted
   - Feedback Ratio reflects positive / total vote ratio

- [ ] **Step 3: Run the full test suite one final time**

```bash
cd adaptive-rag
pytest tests/ -v
```

Expected: all tests PASS.

- [ ] **Step 4: Final commit**

```bash
git add adaptive-rag/app.py
git commit -m "feat: add monitoring tab — MRR and feedback ratio dashboard"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| Incremental embedding updates (no full re-index) | Task 3 — chunk ID idempotency in `ingest_pdf` |
| Feedback loop adjusts retrieval scores | Task 4 (`feedback.py`) + Task 7 (`retrieve`) |
| LLM query complexity classification | Task 6 (`classify_query` via Claude Haiku) |
| Simple/moderate/complex routing | Task 6 — `COMPLEXITY_TOP_N` map |
| MRR metric | Task 5 (`monitor.get_metrics`) |
| Feedback ratio metric | Task 5 (`monitor.get_metrics`) |
| Streamlit app | Tasks 8–10 (`app.py`) |
| Example document ingestion | Task 1 — `sample_docs/` + ingestion tab in Task 8 |
| 10 MB file size limit | Task 8 — enforced in Streamlit uploader |
| IngestionError for scanned PDFs | Task 3 — empty text detection |
| Fallback on Haiku failure | Task 6 — returns "moderate" |
| Empty collection returns [] | Task 7 — `collection.count() == 0` guard |
| Missing feedback log → {} weights | Task 4 — `FEEDBACK_LOG.exists()` check |
| ChromaDB swap path | `_get_collection()` in `ingestion.py` and `retrieval.py` — one class change |

No gaps found.

**Placeholder scan:** No TBD, TODO, "implement later", or "similar to Task N" patterns found.

**Type consistency:** `chunk_id` string key used consistently across `feedback.record`, `monitor.log_session`, `retrieval.retrieve`, and Streamlit feedback buttons. `get_weights()` returns `dict[str, float]` consumed by `retrieve`. `get_metrics()` returns a dict with keys `mrr`, `feedback_ratio`, `total_queries`, `total_votes` — all consumed in Task 10.
