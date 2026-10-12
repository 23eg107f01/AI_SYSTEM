import asyncio
import logging
from datetime import datetime, timedelta, timezone
from db.base import SessionLocal
from models.ticket import Ticket, TicketStatus
from config import settings

logger = logging.getLogger(__name__)

async def sla_tracker_task():
    """Background task to track SLA breaches."""
    logger.info("SLA Tracker started. Checking every 60 seconds.")
    while True:
        try:
            db = SessionLocal()
            try:
                now = datetime.now(timezone.utc)
                amber_threshold = now - timedelta(minutes=settings.SLA_AMBER_MINUTES)
                red_threshold = now - timedelta(minutes=settings.SLA_RED_MINUTES)

                # Find tickets breaching red
                red_tickets = db.query(Ticket).filter(
                    Ticket.status == TicketStatus.OPEN,
                    Ticket.created_at <= red_threshold
                ).all()

                # Find tickets breaching amber but not red
                amber_tickets = db.query(Ticket).filter(
                    Ticket.status == TicketStatus.OPEN,
                    Ticket.created_at <= amber_threshold,
                    Ticket.created_at > red_threshold
                ).all()

                if red_tickets:
                    logger.warning("SLA BREACH (RED): %d tickets open > %dm", len(red_tickets), settings.SLA_RED_MINUTES)
                
                if amber_tickets:
                    logger.info("SLA WARNING (AMBER): %d tickets open > %dm", len(amber_tickets), settings.SLA_AMBER_MINUTES)
            finally:
                db.close()
        except Exception as e:
            logger.error("Error in SLA tracker: %s", e)
        
        await asyncio.sleep(60)

def start_sla_tracker():
    """Starts the SLA tracker as a background asyncio task (if possible)."""
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(sla_tracker_task())
        logger.info("SLA tracker started successfully.")
    except RuntimeError:
        # No running event loop (e.g., Vercel serverless), skip starting SLA tracker
        logger.info("No running event loop, skipping SLA tracker (serverless environment).")
    except Exception as e:
        logger.warning("Failed to start SLA tracker: %s", e)
