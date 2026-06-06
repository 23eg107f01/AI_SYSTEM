"""
Knowledge Base endpoints.

POST /admin/upload-kb  — upload document, trigger background ingestion (admin only)
GET  /api/kb           — list KB documents
DELETE /api/kb/{id}    — delete document + ChromaDB chunks (admin only)
"""
import logging
import os
import tempfile

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from auth import require_admin, get_current_user
from db.base import get_db, SessionLocal
from models import User
from models.ticket import KBDocument

logger = logging.getLogger(__name__)

router = APIRouter(tags=["knowledge-base"])

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


def _db_factory():
    """Returns a new DB session — used by background tasks."""
    return SessionLocal()


# ─── POST /admin/upload-kb ────────────────────────────────────────────────────

@router.post("/admin/upload-kb", status_code=202)
async def upload_kb_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    category: str = Form("General"),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """
    Upload a KB document (PDF, DOCX, TXT — max 10 MB).

    Returns immediately (HTTP 202 Accepted).
    Ingestion (text extraction → chunking → embedding → ChromaDB) runs
    as a non-blocking background task.
    The kb_documents record status changes from 'processing' → 'ready' (or 'error').
    """
    from services.ingestion import ingest_document_task
    
    filename = file.filename or "document"
    ext = os.path.splitext(filename)[1].lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            400,
            f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(413, f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)} MB.")

    # Write to a persistent temp file (background task cleans it up)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    try:
        tmp.write(content)
        tmp_path = tmp.name
    finally:
        tmp.close()

    # Create DB record with status=processing
    kb_doc = KBDocument(filename=filename, category=category, status="processing")
    db.add(kb_doc)
    db.commit()
    db.refresh(kb_doc)

    # Schedule background ingestion — returns immediately to caller
    background_tasks.add_task(
        ingest_document_task,
        file_path=tmp_path,
        category=category,
        source_file=filename,
        kb_doc_id=kb_doc.id,
        db_session_factory=_db_factory,
    )

    logger.info("Queued background ingestion for '%s' (doc_id=%d)", filename, kb_doc.id)

    return {
        "id": kb_doc.id,
        "filename": filename,
        "category": category,
        "status": "processing",
        "message": "Ingestion started in background. Poll GET /api/kb to check status.",
    }


# ─── GET /api/kb ──────────────────────────────────────────────────────────────

@router.get("/api/kb", response_model=list[dict])
async def list_documents(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """List all KB documents with their ingestion status."""
    docs = db.query(KBDocument).order_by(KBDocument.uploaded_at.desc()).all()
    return [
        {
            "id": d.id,
            "filename": d.filename,
            "category": d.category,
            "status": d.status,
            "uploaded_at": d.uploaded_at.isoformat(),
        }
        for d in docs
    ]


# ─── DELETE /api/kb/{id} ──────────────────────────────────────────────────────

@router.delete("/api/kb/{doc_id}", status_code=204)
async def delete_document(
    doc_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Delete a KB document and all its ChromaDB vector chunks."""
    from services.chroma_client import delete_document_chunks
    
    doc = db.query(KBDocument).filter(KBDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")

    try:
        delete_document_chunks(doc.filename)
    except Exception as e:
        logger.warning("ChromaDB chunk deletion failed for '%s': %s", doc.filename, e)

    db.delete(doc)
    db.commit()
