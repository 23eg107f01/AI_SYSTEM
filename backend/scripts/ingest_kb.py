"""
CLI script to bulk-ingest knowledge base documents.

Usage:
    python scripts/ingest_kb.py --folder ./knowledge_base
    python scripts/ingest_kb.py --file ./knowledge_base/faq.pdf --category Billing
"""
import argparse
import logging
import os
import sys

# Add parent directory to path so we can import backend modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from services.ingestion import ingest_document

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt"}

# Auto-detect category from filename keywords
CATEGORY_KEYWORDS = {
    "billing": "Billing",
    "invoice": "Billing",
    "payment": "Billing",
    "pricing": "Billing",
    "refund": "Returns",
    "return": "Returns",
    "exchange": "Returns",
    "technical": "Technical",
    "setup": "Technical",
    "install": "Technical",
    "guide": "Technical",
    "manual": "Technical",
    "faq": "General",
    "help": "General",
    "policy": "General",
}


def detect_category(filename: str) -> str:
    lower = filename.lower()
    for keyword, category in CATEGORY_KEYWORDS.items():
        if keyword in lower:
            return category
    return "General"


def ingest_folder(folder_path: str, default_category: str = None) -> None:
    if not os.path.isdir(folder_path):
        logger.error("Folder not found: %s", folder_path)
        sys.exit(1)

    files = [
        f for f in os.listdir(folder_path)
        if os.path.splitext(f)[1].lower() in SUPPORTED_EXTENSIONS
    ]

    if not files:
        logger.warning("No supported files found in %s", folder_path)
        return

    logger.info("Found %d document(s) to ingest", len(files))
    success, failed = 0, 0

    for filename in files:
        file_path = os.path.join(folder_path, filename)
        category = default_category or detect_category(filename)

        try:
            chunk_count, _ = ingest_document(file_path=file_path, category=category)
            logger.info("✓ %s → %d chunks [%s]", filename, chunk_count, category)
            success += 1
        except Exception as e:
            logger.error("✗ %s — %s", filename, e)
            failed += 1

    logger.info("Ingestion complete: %d succeeded, %d failed", success, failed)


def ingest_single(file_path: str, category: str = None) -> None:
    if not os.path.isfile(file_path):
        logger.error("File not found: %s", file_path)
        sys.exit(1)

    category = category or detect_category(os.path.basename(file_path))
    try:
        chunk_count, _ = ingest_document(file_path=file_path, category=category)
        logger.info("✓ Ingested %d chunks from %s [%s]", chunk_count, file_path, category)
    except Exception as e:
        logger.error("✗ Ingestion failed: %s", e)
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bulk-ingest KB documents into ChromaDB")
    parser.add_argument("--folder", help="Path to folder containing documents")
    parser.add_argument("--file", help="Path to a single document")
    parser.add_argument("--category", help="Override category (Billing|Technical|Returns|General)")

    args = parser.parse_args()

    if args.folder:
        ingest_folder(args.folder, args.category)
    elif args.file:
        ingest_single(args.file, args.category)
    else:
        parser.print_help()
        sys.exit(1)
