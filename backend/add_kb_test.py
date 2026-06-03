import sys
from db.base import SessionLocal
from models.ticket import KBDocument
from services.ingestion import ingest_document_task
import os

def add_doc():
    doc_content = """
# Acme Corp Support Knowledge Base

## Return Policy
Customers can return items within 30 days of purchase for a full refund. Items must be in original condition with all tags attached. To initiate a return, contact support or use the portal. If a customer is asking about a return, let them know about the 30-day window.

## Password Reset
To reset your password, click the 'Forgot Password' link on the login page. An email will be sent with a reset link valid for 24 hours.

## Shipping Times
Standard shipping takes 3-5 business days. Expedited shipping takes 1-2 business days. International shipping can take up to 14 days depending on customs.

## Contacting Support
If you have an urgent issue, please let the agent know and they will escalate your ticket.
    """
    
    file_path = os.path.join(os.getcwd(), "dummy_kb.txt")
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(doc_content)
        
    db = SessionLocal()
    
    # Check if it already exists
    existing = db.query(KBDocument).filter(KBDocument.filename == "dummy_kb.txt").first()
    if existing:
        print("Document already exists.")
        db.close()
        return

    kb_doc = KBDocument(filename="dummy_kb.txt", category="General", status="processing")
    db.add(kb_doc)
    db.commit()
    db.refresh(kb_doc)
    
    print(f"Added KB doc ID {kb_doc.id}")
    
    def _db_factory():
        from db.base import SessionLocal
        return SessionLocal()
        
    print("Running ingestion task...")
    ingest_document_task(file_path, "General", "dummy_kb.txt", kb_doc.id, _db_factory)
    print("Ingestion complete.")
    db.close()

if __name__ == "__main__":
    add_doc()
