"""
Knowledge Base ingestion service.
PDF / DOCX / TXT → text extraction → chunking → embeddings → ChromaDB.

ingest_document()       — synchronous, used directly or in background tasks
ingest_document_task()  — async wrapper used as FastAPI BackgroundTask
"""
import hashlib
import logging
import os
import traceback
from decimal import Decimal
from pathlib import Path
from typing import List, Tuple

import fitz  # PyMuPDF
from docx import Document as DocxDocument
from langchain_text_splitters import RecursiveCharacterTextSplitter

from services.chroma_client import add_chunks

logger = logging.getLogger(__name__)

# Chunking config per spec: 500 tokens, 50 overlap
CHUNK_SIZE = 500
CHUNK_OVERLAP = 50

text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=CHUNK_SIZE,
    chunk_overlap=CHUNK_OVERLAP,
    length_function=len,
)


# ─── Text extractors ─────────────────────────────────────────────────────────

def extract_text_from_pdf(file_path: str) -> str:
    doc = fitz.open(file_path)
    pages = [page.get_text() for page in doc]
    doc.close()
    return "\n".join(pages)


def extract_text_from_docx(file_path: str) -> str:
    doc = DocxDocument(file_path)
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())


def extract_text_from_txt(file_path: str) -> str:
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        return f.read()


def extract_text(file_path: str) -> str:
    ext = Path(file_path).suffix.lower()
    if ext == ".pdf":
        return extract_text_from_pdf(file_path)
    elif ext in (".docx", ".doc"):
        return extract_text_from_docx(file_path)
    elif ext == ".txt":
        return extract_text_from_txt(file_path)
    else:
        raise ValueError(f"Unsupported file format: {ext}. Use PDF, DOCX, or TXT.")


# ─── Core ingestion ───────────────────────────────────────────────────────────

def ingest_document(
    file_path: str,
    category: str = "General",
    source_file: str = None,
) -> Tuple[int, List[str]]:
    """
    Synchronous ingestion pipeline:
    1. Extract text
    2. Split into 500-char chunks with 50-char overlap
    3. Build deterministic chunk IDs (MD5 of source+index)
    4. Upsert embeddings into ChromaDB with metadata

    Args:
        file_path:   Absolute path to the document on disk.
        category:    KB category tag stored in ChromaDB metadata.
        source_file: Display filename stored in metadata (defaults to basename).

    Returns:
        (chunk_count, list_of_chunk_ids)
    """
    if source_file is None:
        source_file = os.path.basename(file_path)

    logger.info("Ingesting: %s (category=%s)", source_file, category)

    raw_text = extract_text(file_path)
    if not raw_text.strip():
        raise ValueError(f"No text extracted from {source_file}")

    chunks = text_splitter.split_text(raw_text)
    logger.info("Split into %d chunks", len(chunks))

    ids, metadatas = [], []
    for i, chunk in enumerate(chunks):
        chunk_id = hashlib.md5(f"{source_file}::chunk_{i}".encode()).hexdigest()
        ids.append(chunk_id)
        metadatas.append({
            "source_file": source_file,
            "category": category,
            "chunk_index": i,
            "total_chunks": len(chunks),
        })

    add_chunks(chunks=chunks, metadatas=metadatas, ids=ids)
    logger.info("Ingested %d chunks for '%s'", len(chunks), source_file)
    return len(chunks), ids


# ─── Background task wrapper ──────────────────────────────────────────────────

async def ingest_document_task(
    file_path: str,
    category: str,
    source_file: str,
    kb_doc_id: int,
    db_session_factory,  # callable → Session
) -> None:
    """
    FastAPI BackgroundTask wrapper.
    Runs ingestion after the HTTP response is returned.
    Updates kb_documents.status to 'ready' or 'error'.
    Cleans up the temp file when done.
    """
    from models.ticket import KBDocument
    from services.audit import log_action

    db = db_session_factory()
    try:
        chunk_count, _ = ingest_document(
            file_path=file_path,
            category=category,
            source_file=source_file,
        )

        kb_doc = db.query(KBDocument).filter(KBDocument.id == kb_doc_id).first()
        if kb_doc:
            kb_doc.status = "ready"

        log_action(db, action="ingest", model_used="sentence-transformers/all-MiniLM-L6-v2")
        db.commit()
        logger.info("Background ingestion complete: %s (%d chunks)", source_file, chunk_count)

    except Exception as e:
        full_trace = traceback.format_exc()
        logger.error("Background ingestion failed for %s: %s\n%s", source_file, e, full_trace)

        db.rollback()
        try:
            kb_doc = db.query(KBDocument).filter(KBDocument.id == kb_doc_id).first()
            if kb_doc:
                kb_doc.status = "error"
            db.commit()
        except Exception:
            pass

    finally:
        db.close()
        # Clean up temp file
        try:
            if os.path.exists(file_path):
                os.unlink(file_path)
        except Exception:
            pass
