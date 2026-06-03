"""
Manager dashboard endpoints:
  GET /api/dashboard/stats     — ticket volume, sentiment breakdown, avg quality, SLA compliance
  GET /api/dashboard/audit     — recent audit log entries with cost
  GET /api/dashboard/escalations — list escalated tickets for agent queue
  PATCH /api/tickets/{id}/resolve — agent resolves a ticket
  GET /api/dashboard/sla-status - list of tickets breaching SLA
  WS /api/dashboard/ws - websocket for live stats
"""
import logging
import asyncio
from typing import Any, Optional
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import func, case, extract
from sqlalchemy.orm import Session

from auth import get_current_user, require_manager, require_agent
from db.base import get_db, SessionLocal
from models import User, Ticket, AuditLog, Escalation, TicketStatus, TicketSentiment
from config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _enum_value(value: Any) -> Any:
    return value.value if hasattr(value, "value") else value


def fetch_dashboard_stats(db: Session):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Total tickets
    total_tickets = db.query(func.count(Ticket.id)).scalar()
    today_tickets = db.query(func.count(Ticket.id)).filter(Ticket.created_at >= today_start).scalar()

    # Tickets by category
    category_counts = db.query(Ticket.category, func.count(Ticket.id)).group_by(Ticket.category).all()
    by_category = {_enum_value(cat): count for cat, count in category_counts if cat is not None}

    # Tickets by status
    status_counts = db.query(Ticket.status, func.count(Ticket.id)).group_by(Ticket.status).all()
    by_status = {_enum_value(s): count for s, count in status_counts if s is not None}

    # Sentiment breakdown
    sentiment_counts = db.query(Ticket.sentiment, func.count(Ticket.id)).group_by(Ticket.sentiment).all()
    by_sentiment = {_enum_value(s): count for s, count in sentiment_counts if s is not None}

    # Average quality score & trend
    from models.ticket import Response
    avg_quality = db.query(func.avg(Response.quality_score)).scalar()
    avg_quality = round(float(avg_quality), 2) if avg_quality else 0.0

    seven_days_ago = now - timedelta(days=7)
    trend_data = (
        db.query(func.date(Response.created_at).label('date'), func.avg(Response.quality_score).label('avg_score'))
        .filter(Response.created_at >= seven_days_ago)
        .group_by(func.date(Response.created_at))
        .all()
    )
    quality_trend = [{"date": str(d.date), "score": round(float(d.avg_score), 2)} for d in trend_data]
    
    # Escalation rate
    escalated_count = db.query(func.count(Ticket.id)).filter(Ticket.status == TicketStatus.ESCALATED).scalar() or 0
    escalation_rate = round((escalated_count / total_tickets) * 100, 2) if total_tickets > 0 else 0.0

    # Avg response time (resolved_at - created_at)
    resolved_tickets = db.query(Ticket).filter(Ticket.status == TicketStatus.RESOLVED, Ticket.resolved_at.isnot(None)).all()
    total_seconds = sum((t.resolved_at - t.created_at).total_seconds() for t in resolved_tickets)
    avg_response_time_minutes = round((total_seconds / len(resolved_tickets)) / 60, 2) if resolved_tickets else 0.0

    # SLA compliance rate
    # % of resolved tickets that were resolved within the red SLA threshold
    compliant_count = 0
    for t in resolved_tickets:
        if (t.resolved_at - t.created_at).total_seconds() <= settings.SLA_RED_MINUTES * 60:
            compliant_count += 1
    sla_compliance_rate = round((compliant_count / len(resolved_tickets)) * 100, 2) if resolved_tickets else 100.0

    # SLA: open tickets beyond thresholds
    amber_threshold = now - timedelta(minutes=settings.SLA_AMBER_MINUTES)
    red_threshold = now - timedelta(minutes=settings.SLA_RED_MINUTES)

    amber_count = (
        db.query(func.count(Ticket.id))
        .filter(
            Ticket.status == TicketStatus.OPEN,
            Ticket.created_at <= amber_threshold,
            Ticket.created_at > red_threshold,
        )
        .scalar()
    )

    red_count = (
        db.query(func.count(Ticket.id))
        .filter(
            Ticket.status == TicketStatus.OPEN,
            Ticket.created_at <= red_threshold,
        )
        .scalar()
    )

    # Today's LLM cost
    today_cost = (
        db.query(func.sum(AuditLog.cost_usd))
        .filter(AuditLog.timestamp >= today_start)
        .scalar()
    )
    today_cost = float(today_cost or 0.0)

    return {
        "total_tickets": total_tickets,
        "today_tickets": today_tickets,
        "by_category": by_category,
        "by_status": by_status,
        "by_sentiment": by_sentiment,
        "avg_quality_score": avg_quality,
        "quality_trend": quality_trend,
        "escalation_rate": escalation_rate,
        "avg_response_time_minutes": avg_response_time_minutes,
        "sla_compliance_rate": sla_compliance_rate,
        "sla": {
            "amber_count": amber_count or 0,
            "red_count": red_count or 0,
        },
        "today_llm_cost_usd": round(today_cost, 4),
        "generated_at": now.isoformat(),
    }


@router.get("/stats")
async def get_stats(
    db: Session = Depends(get_db),
    _: User = Depends(require_manager),
):
    """Dashboard summary stats (manager only)"""
    return fetch_dashboard_stats(db)


@router.websocket("/ws")
async def dashboard_websocket(websocket: WebSocket):
    """Websocket endpoint for live dashboard stats."""
    await websocket.accept()
    # Simplified authentication for WS in this prototype (assume connection is allowed or verified via token in query)
    try:
        while True:
            with SessionLocal() as db:
                stats = fetch_dashboard_stats(db)
            await websocket.send_json(stats)
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        logger.info("Dashboard websocket disconnected")
    except Exception as e:
        logger.error(f"Dashboard websocket error: {e}")
        await websocket.close()


@router.get("/sla-status")
async def get_sla_status(
    db: Session = Depends(get_db),
    _: User = Depends(require_manager),
):
    """Returns open tickets that have breached SLA thresholds."""
    now = datetime.now(timezone.utc)
    amber_threshold = now - timedelta(minutes=settings.SLA_AMBER_MINUTES)
    red_threshold = now - timedelta(minutes=settings.SLA_RED_MINUTES)
    
    breached_tickets = db.query(Ticket).filter(
        Ticket.status == TicketStatus.OPEN,
        Ticket.created_at <= amber_threshold
    ).order_by(Ticket.created_at.asc()).all()
    
    result = []
    for t in breached_tickets:
        status_flag = "red" if t.created_at <= red_threshold else "amber"
        result.append({
            "id": t.id,
            "user_id": t.user_id,
            "category": _enum_value(t.category) if t.category else None,
            "created_at": t.created_at.isoformat(),
            "open_minutes": round((now - t.created_at).total_seconds() / 60, 1),
            "flag": status_flag
        })
    return result


@router.get("/audit")
async def get_audit_log(
    limit: int = 50,
    db: Session = Depends(get_db),
    _: User = Depends(require_manager),
):
    """Recent audit log entries (manager only)."""
    entries = (
        db.query(AuditLog)
        .order_by(AuditLog.timestamp.desc())
        .limit(min(limit, 200))
        .all()
    )
    return [
        {
            "id": e.id,
            "ticket_id": e.ticket_id,
            "action": e.action,
            "model_used": e.model_used,
            "input_tokens": e.input_tokens,
            "output_tokens": e.output_tokens,
            "cost_usd": float(e.cost_usd) if e.cost_usd else 0.0,
            "timestamp": e.timestamp.isoformat(),
        }
        for e in entries
    ]


@router.get("/escalations")
async def get_escalations(
    db: Session = Depends(get_db),
    _: User = Depends(require_agent),
):
    """
    List all escalated tickets for the agent queue.
    """
    escalated = (
        db.query(Ticket)
        .filter(Ticket.status == TicketStatus.ESCALATED)
        .order_by(Ticket.created_at.asc())  # Oldest first (FIFO queue)
        .all()
    )

    result = []
    for t in escalated:
        item = {
            "ticket_id": t.id,
            "user_id": t.user_id,
            "message": t.message,
            "category": _enum_value(t.category) if t.category else None,
            "sentiment": _enum_value(t.sentiment) if t.sentiment else None,
            "created_at": t.created_at.isoformat(),
            "escalation_reason": None,
            "assigned_agent_id": None,
        }
        if t.escalation:
            item["escalation_reason"] = t.escalation.reason
            item["assigned_agent_id"] = t.escalation.assigned_agent_id
        result.append(item)

    return result


@router.patch("/tickets/{ticket_id}/resolve", tags=["tickets"])
async def resolve_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_agent),
):
    """Agent marks a ticket as resolved."""
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(404, "Ticket not found")

    ticket.status = TicketStatus.RESOLVED
    ticket.resolved_at = datetime.now(timezone.utc)
    db.commit()
    return {"ticket_id": ticket.id, "status": "resolved"}
