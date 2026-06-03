"""
Migration script for manager handoff metadata.
Adds customer_name and customer_email columns to tickets.
"""
import logging

from sqlalchemy import text

from db.base import engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("migrate_v3")


def run_migration() -> None:
    logger.info("Applying v3 ticket contact migration...")
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE tickets ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255);"))
        conn.execute(text("ALTER TABLE tickets ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255);"))
    logger.info("v3 migration complete.")


if __name__ == "__main__":
    run_migration()
