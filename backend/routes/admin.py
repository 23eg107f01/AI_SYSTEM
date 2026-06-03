"""
Admin endpoints:
  POST /admin/upload-kb  — upload a document to the knowledge base
  GET  /admin/kb         — list knowledge base documents
"""
import logging
import os
import shutil
import tempfile
from typing import List

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    UploadFile,
)
from sqlalchemy.orm import Session

from auth import require_admin_role
from db.base import SessionLocal, get_db
from models import User
from models.ticket import KBDocument
from services.ingestion import ingest_document_task

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin_role)],
)


def _db_factory():
    return SessionLocal()


# Max file size: 10MB
MAX_FILE_SIZE = 10 * 1024 * 1024


@router.post("/upload-kb", status_code=202)
async def upload_kb_document(
    category: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
    current_user: User = Depends(require_admin_role),
):
    """
    Upload a document (PDF, DOCX, TXT) to the knowledge base.
    - Validates file type and size.
    - Saves file to a temporary location.
    - Creates a KBDocument record with status 'processing'.
    - Schedules a background task for ingestion.
    - Returns immediately with a 202 Accepted response.
    """
    # 1. Validate file size
    file.file.seek(0, 2)
    file_size = file.file.tell()
    await file.seek(0)
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File size {file_size} exceeds limit of {MAX_FILE_SIZE} bytes.",
        )

    # 2. Validate file type
    allowed_ext = {".pdf", ".docx", ".txt"}
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in allowed_ext:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{file_ext}'. Allowed: {', '.join(allowed_ext)}",
        )

    # 3. Save to temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    # 4. Create DB record
    kb_doc = KBDocument(
        filename=file.filename,
        category=category,
        status="processing",
        uploader_id=current_user.id,
    )
    db.add(kb_doc)
    db.commit()
    db.refresh(kb_doc)

    # 5. Schedule background ingestion task
    background_tasks.add_task(
        ingest_document_task, tmp_path, category, file.filename, kb_doc.id, _db_factory
    )

    logger.info("Accepted file '%s' for ingestion (ticket %d)", file.filename, kb_doc.id)
    return {"message": "File accepted for processing.", "document_id": kb_doc.id}