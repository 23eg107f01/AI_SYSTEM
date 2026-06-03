# Knowledge Base Documents

Place your KB documents here before running ingestion.

Supported formats: PDF, DOCX, TXT

Auto-detected categories by filename keyword:
- billing / invoice / payment / pricing → Billing
- refund / return / exchange → Returns
- technical / setup / install / guide / manual → Technical
- faq / help / policy → General

Run ingestion:
```bash
cd backend
python scripts/ingest_kb.py --folder ../knowledge_base
```
