"""
Audit logging helpers — every AI action is recorded in PostgreSQL.
"""
import logging
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from models.ticket import AuditLog

logger = logging.getLogger(__name__)


def log_action(
    db: Session,
    action: str,
    ticket_id: Optional[int] = None,
    model_used: Optional[str] = None,
    input_tokens: Optional[int] = None,
    output_tokens: Optional[int] = None,
    cost_usd: Optional[float] = None,
) -> AuditLog:
    """
    Record an AI action to the audit_logs table.

    Args:
        db:           SQLAlchemy session.
        action:       Action name (classify | sentiment | rag | quality | escalate | ingest).
        ticket_id:    Associated ticket ID (if any).
        model_used:   LLM model identifier.
        input_tokens: Tokens consumed in the prompt.
        output_tokens: Tokens generated in the response.
        cost_usd:     Estimated cost in USD.

    Returns:
        The created AuditLog record.
    """
    entry = AuditLog(
        ticket_id=ticket_id,
        action=action,
        model_used=model_used,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=Decimal(str(cost_usd)) if cost_usd is not None else None,
    )
    db.add(entry)
    db.flush()  # Get the ID without committing — caller commits
    logger.debug("Audit: action=%s ticket=%s cost=$%s", action, ticket_id, cost_usd)
    return entry
