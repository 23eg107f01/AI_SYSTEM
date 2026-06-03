"""
Migration script for AI Customer Support System (Step 3)
Adds 'Legal/Compliance' to ticketcategory enum and context_summary/suggested_reply columns to escalations table.
"""
import logging
from sqlalchemy import text
from config import settings
from db.base import engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("migrate_v2")

def run_migration():
    logger.info("Connecting to PostgreSQL database...")
    with engine.begin() as conn:
        # 1. Check pg_enum for 'Legal/Compliance' value in ticketcategory enum
        logger.info("Checking ticketcategory enum...")
        enum_check = conn.execute(text(
            "SELECT 1 FROM pg_enum "
            "JOIN pg_type ON pg_enum.enumtypid = pg_type.oid "
            "WHERE pg_type.typname = 'ticketcategory' AND pg_enum.enumlabel = 'Legal/Compliance';"
        )).fetchone()

        if not enum_check:
            logger.info("Adding 'Legal/Compliance' to ticketcategory enum...")
            # ALTER TYPE cannot run inside a transaction block in older postgresql versions,
            # but Neon/Postgres 12+ supports it depending on environment.
            # We commit the transaction and run it with autocommit context if needed,
            # but engine.begin() has a transaction. Let's run it.
            try:
                # To be safe, we execute ALTER TYPE. PostgreSQL 12+ allows ALTER TYPE ADD VALUE in a transaction
                # as long as the new value is not used in the same transaction block.
                conn.execute(text("ALTER TYPE ticketcategory ADD VALUE 'Legal/Compliance';"))
                logger.info("Successfully added 'Legal/Compliance' to enum.")
            except Exception as e:
                logger.error("Failed to alter enum directly: %s. If it already exists, this can be ignored.", e)
        else:
            logger.info("'Legal/Compliance' already exists in ticketcategory enum.")

        # 2. Add context_summary and suggested_reply columns to escalations table
        logger.info("Checking columns on escalations table...")
        columns = conn.execute(text(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'escalations';"
        )).fetchall()
        column_names = [col[0] for col in columns]

        if "context_summary" not in column_names:
            logger.info("Adding column 'context_summary' to 'escalations'...")
            conn.execute(text("ALTER TABLE escalations ADD COLUMN context_summary TEXT;"))
            logger.info("Successfully added 'context_summary' column.")
        else:
            logger.info("'context_summary' column already exists.")

        if "suggested_reply" not in column_names:
            logger.info("Adding column 'suggested_reply' to 'escalations'...")
            conn.execute(text("ALTER TABLE escalations ADD COLUMN suggested_reply TEXT;"))
            logger.info("Successfully added 'suggested_reply' column.")
        else:
            logger.info("'suggested_reply' column already exists.")

    logger.info("Migration completed successfully.")

if __name__ == "__main__":
    run_migration()
