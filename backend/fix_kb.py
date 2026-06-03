import asyncio
import os
import sys

# Ensure backend directory is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from db.base import SessionLocal
from models.ticket import KBDocument
from services.ingestion import ingest_document_task

async def main():
    def _db_factory():
        return SessionLocal()
        
    db = SessionLocal()
    kb_doc = db.query(KBDocument).filter(KBDocument.filename == "dummy_kb.txt").first()
    if not kb_doc:
        print("Creating DB record")
        kb_doc = KBDocument(filename="dummy_kb.txt", category="General", status="processing")
        db.add(kb_doc)
        db.commit()
        db.refresh(kb_doc)
    doc_id = kb_doc.id
    db.close()

    print(f"Running ingestion task for doc id {doc_id}...")
    file_path = os.path.join(os.getcwd(), "dummy_kb.txt")
    await ingest_document_task(file_path, "General", "dummy_kb.txt", doc_id, _db_factory)
    print("Ingestion complete.")

if __name__ == "__main__":
    asyncio.run(main())
