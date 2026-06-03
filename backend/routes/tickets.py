"""
Ticket endpoints:
  POST /api/tickets        — full AI pipeline (sanitize → classify → sentiment → RAG → respond)
  GET  /api/tickets        — list tickets
  GET  /api/tickets/{id}   — single ticket detail
  POST /api/classify       — standalone classification endpoint
"""
import logging
import re
import traceback
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import (
    APIRouter, BackgroundTasks, Depends, HTTPException, Query,
    Request, WebSocket, WebSocketDisconnect
)
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy.orm import Session

from auth import get_current_user
from auth.dependencies import require_manager
from db.base import get_db, SessionLocal
from models import (
    User, Ticket, Response, Escalation, TicketStatus,
    TicketCategory, TicketSentiment, AuditLog
)
from services.classifier import classify_ticket
from services.sentiment import detect_sentiment
from services.direct_support import generate_direct_response
from services.quality_scorer import score_and_update
from services.guardrails import sanitize_message
from services.audit import log_action

# Rate limiting
from slowapi.util import get_remote_address
from utils.limiter import limiter

logger = logging.getLogger(__name__)
router = APIRouter(tags=["tickets"])


def _db_factory():
    return SessionLocal()


def _enum_value(value: Any) -> Any:
    return value.value if hasattr(value, "value") else value


MANAGER_HANDOFF_PATTERNS = [
    r"\bhuman\b",
    r"\bagent\b",
    r"\bmanager\b",
    r"\brepresentative\b",
    r"\breal person\b",
    r"\bsomeone from support\b",
    r"\bconnect me\b",
    r"\btalk to (a|someone|support)\b",
]

ABUSIVE_LANGUAGE_PATTERNS = [
    r"\bfuck\b",
    r"\bshit\b",
    r"\bbullshit\b",
    r"\bidiot\b",
    r"\bstupid\b",
    r"\buseless\b",
    r"\bbastard\b",
    r"\bmoron\b",
]


def _requests_manager(message: str) -> bool:
    normalized = message.lower()
    return any(re.search(pattern, normalized) for pattern in MANAGER_HANDOFF_PATTERNS)


def _looks_abusive(message: str) -> bool:
    normalized = message.lower()
    return any(re.search(pattern, normalized) for pattern in ABUSIVE_LANGUAGE_PATTERNS)


def _default_customer_name(current_user: User) -> str:
    return f"Customer {current_user.id}"


# ─── Rate limiting key function ──────────────────────────────────────────────
def get_user_or_ip(request: Request) -> str:
    # try to extract authorization token
    auth = request.headers.get("Authorization")
    if auth and auth.startswith("Bearer "):
        token = auth.split(" ")[1]
        try:
            from auth.security import decode_token
            payload = decode_token(token)
            user_id = payload.get("sub")
            if user_id:
                return f"user_{user_id}"
        except Exception:
            pass
    return get_remote_address(request)


# ─── WebSocket Connection Manager ────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info("New agent connected to WebSocket queue. Total connections: %d", len(self.active_connections))

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info("Agent disconnected from WebSocket queue. Total connections: %d", len(self.active_connections))

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning("Failed to send WebSocket message: %s", e)

manager = ConnectionManager()

class ChatConnectionManager:
    def __init__(self):
        self.active_connections: dict[int, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)

    def disconnect(self, websocket: WebSocket, user_id: int):
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def send_personal_message(self, message: dict, user_id: int):
        if user_id in self.active_connections:
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_json(message)
                except Exception:
                    pass

chat_manager = ChatConnectionManager()


# ─── AI Escalation Details Service ───────────────────────────────────────────
async def generate_escalation_details(message: str, category: str, sentiment: str) -> dict:
    """
    Call Groq to generate:
    - context_summary (concise summary of the ticket for agent)
    - suggested_reply (suggested agent reply to copy-paste or edit)
    - calming_message (a message to send to the user)
    """
    from services.groq_client import call_llm_with_json_retry
    
    prompt = f"""You are a customer support expert helper. An escalated ticket has been received.
Analyze the customer's message, category, and sentiment, then generate:
1. A concise summary of the issue for the agent (max 200 characters)
2. A professional suggested response that the agent can send to the user (max 400 characters)
3. A calming and empathetic message to immediately send to the user while they wait for the manager (max 200 characters)

Output a JSON object with exactly three keys:
- "context_summary": the concise summary
- "suggested_reply": the suggested response
- "calming_message": the calming message for the user

Customer Message: "{message}"
Category: {category}
Sentiment: {sentiment}

Output ONLY the JSON object — no explanation, no markdown fences."""

    try:
        data, result = await call_llm_with_json_retry(
            system_prompt=prompt,
            user_message=message,
            max_tokens=300,
            temperature=0.2,
        )
        if data and "context_summary" in data and "suggested_reply" in data:
            return {
                "context_summary": data["context_summary"][:500],
                "suggested_reply": data["suggested_reply"][:1000],
                "calming_message": data.get("calming_message", "Your request has been escalated. A manager will be with you shortly.")[:500],
                "model": result.model,
                "input_tokens": result.input_tokens,
                "output_tokens": result.output_tokens,
                "cost_usd": result.cost_usd,
            }
    except Exception as e:
        logger.error("Failed to generate escalation details using LLM: %s", e)

    # Fallbacks
    return {
        "context_summary": f"Escalated {category} ticket. Sentiment: {sentiment}.",
        "suggested_reply": f"Hello, thank you for contacting support. I see your request regarding {category}. I am looking into it and will get back to you shortly.",
        "calming_message": "Your request has been escalated to a manager. We appreciate your patience and will assist you shortly.",
        "model": "fallback",
        "input_tokens": 0,
        "output_tokens": 0,
        "cost_usd": 0.0,
    }


# ─── Schemas ─────────────────────────────────────────────────────────────────

class CreateTicketRequest(BaseModel):
    message: str
    contact_name: Optional[str] = None
    contact_email: Optional[EmailStr] = None

    @field_validator("message")
    @classmethod
    def message_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Message cannot be empty")
        return v

    @field_validator("contact_name")
    @classmethod
    def normalize_contact_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        value = v.strip()
        return value or None


class ClassifyRequest(BaseModel):
    message: str

    @field_validator("message")
    @classmethod
    def message_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Message cannot be empty")
        return v


class TicketOut(BaseModel):
    id: int
    user_id: int
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    message: str
    category: Optional[str] = None
    sentiment: Optional[str] = None
    status: str
    created_at: datetime
    resolved_at: Optional[datetime] = None
    model_config = {"from_attributes": True}


class ResponseOut(BaseModel):
    id: int
    ticket_id: int
    response_text: str
    citations: Optional[list] = None
    quality_score: Optional[float] = None
    created_at: datetime
    model_config = {"from_attributes": True}


class TicketDetailOut(TicketOut):
    response: Optional[ResponseOut] = None
    escalation: Optional[dict] = None

    model_config = {"from_attributes": True, "arbitrary_types_allowed": True}


class FullPipelineResponse(BaseModel):
    id: int
    response: str
    category: Optional[str] = None
    sentiment: Optional[str] = None
    quality_score: Optional[float] = None
    citations: Optional[list] = None
    status: str
    handoff_to_manager: bool = False


class AgentResponsePayload(BaseModel):
    response_text: str

    @field_validator("response_text")
    @classmethod
    def response_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Response cannot be empty")
        return v


# ─── POST /api/classify ───────────────────────────────────────────────────────

@router.post("/api/classify", tags=["tickets"])
async def classify_message(
    payload: ClassifyRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Standalone classification endpoint.
    Input: message
    Output: { category, confidence, model }
    """
    sanitized = sanitize_message(payload.message)
    if sanitized.is_injection:
        raise HTTPException(400, "Message contains disallowed patterns.")

    result = await classify_ticket(sanitized.text)
    return {
        "category": result["category"],
        "confidence": result["confidence"],
        "model": result["model"],
        "needs_human_review": result.get("needs_human_review", False),
    }


# ─── POST /api/tickets ────────────────────────────────────────────────────────

@router.post("/api/tickets", response_model=FullPipelineResponse, status_code=201)
@limiter.limit("10/minute", key_func=get_user_or_ip)
async def create_ticket(
    request: Request,
    payload: CreateTicketRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Full AI support pipeline:
    1. Validate JWT + rate limit (10 req/min per user via slowapi)
    2. Prompt injection guard
    3. Classification chain → get category (Supports Legal/Compliance)
    4. Sentiment chain → get sentiment
    5. IF Angry OR Legal/Compliance → escalate, return escalation message
    6. ELSE → embed → ChromaDB search → RAG chain → get response + citations
    7. Quality scoring (async, non-blocking)
    8. Write to PostgreSQL: ticket + response + audit_log
    9. Start SLA timer
    10. Return: { response, category, sentiment, quality_score, citations }
    """
    # ── 1. Sanitize (Prompt injection guard) ──────────────────────────────
    sanitized = sanitize_message(payload.message)
    if sanitized.is_injection:
        logger.warning(
            "Injection attempt blocked for user %d: %s",
            current_user.id, sanitized.violations,
        )
        raise HTTPException(
            400,
            "Your message contains patterns that violate our input policy. Please rephrase.",
        )
    clean_message = sanitized.text

    # ── 2. Create ticket record ─────────────────────────────────────────────
    ticket = Ticket(
        user_id=current_user.id,
        customer_name=payload.contact_name or _default_customer_name(current_user),
        customer_email=str(payload.contact_email) if payload.contact_email else current_user.email,
        message=clean_message,
        status=TicketStatus.OPEN,
    )
    db.add(ticket)
    db.flush()  # get ticket.id

    needs_human_review = False

    try:
        # ── 3. Classify category ────────────────────────────────────────────
        classification = await classify_ticket(clean_message)
        ticket.category = TicketCategory(classification["category"])
        log_action(
            db, action="classify", ticket_id=ticket.id,
            model_used=classification["model"],
            input_tokens=classification["input_tokens"],
            output_tokens=classification["output_tokens"],
            cost_usd=classification["cost_usd"],
        )
        if classification.get("needs_human_review"):
            needs_human_review = True

        # ── 4. Detect sentiment ────────────────────────────────────────────
        sentiment_result = await detect_sentiment(clean_message)
        ticket.sentiment = TicketSentiment(sentiment_result["sentiment"])
        log_action(
            db, action="sentiment", ticket_id=ticket.id,
            model_used=sentiment_result["model"],
            input_tokens=sentiment_result["input_tokens"],
            output_tokens=sentiment_result["output_tokens"],
            cost_usd=sentiment_result["cost_usd"],
        )
        if sentiment_result.get("needs_human_review"):
            needs_human_review = True

        # ── 5. Escalation check (Angry OR Legal/Compliance → status = ESCALATED) ─
        requested_manager = _requests_manager(clean_message)
        abusive_language = _looks_abusive(clean_message)
        should_escalate = (
            ticket.sentiment == TicketSentiment.ANGRY or
            ticket.category == TicketCategory.LEGAL or
            requested_manager or
            abusive_language or
            sentiment_result.get("escalate") or
            needs_human_review
        )

        if should_escalate:
            ticket.status = TicketStatus.ESCALATED
            
            # Determine escalation reason
            if ticket.sentiment == TicketSentiment.ANGRY or abusive_language:
                reason = "Customer is upset or abusive - manager intervention required"
            elif ticket.category == TicketCategory.LEGAL:
                reason = "Legal/Compliance category detected"
            elif requested_manager:
                reason = "Customer explicitly requested a human manager"
            elif needs_human_review:
                reason = "AI pipeline flagged for review (low confidence / timeout)"
            else:
                reason = "Auto-escalation criteria met"
                
            # Generate AI context summary and suggested reply
            esc_details = await generate_escalation_details(
                message=clean_message,
                category=_enum_value(ticket.category) if ticket.category else "General",
                sentiment=_enum_value(ticket.sentiment) if ticket.sentiment else "Neutral"
            )
            
            escalation = Escalation(
                ticket_id=ticket.id,
                reason=reason,
                context_summary=esc_details["context_summary"],
                suggested_reply=esc_details["suggested_reply"]
            )
            db.add(escalation)
            db.flush()

            response_text = esc_details.get(
                "calming_message",
                "I’m connecting you with a manager now. Please stay with me while they review your case.",
            )
            response_obj = Response(
                ticket_id=ticket.id,
                response_text=response_text,
                citations=None,
                quality_score=None,
            )
            db.add(response_obj)
            log_action(db, action="escalate", ticket_id=ticket.id)
            
            # Notify agent queue WebSocket
            background_tasks.add_task(
                manager.broadcast,
                {
                    "event": "ticket_escalated",
                    "ticket_id": ticket.id,
                    "category": _enum_value(ticket.category) if ticket.category else "General",
                    "sentiment": _enum_value(ticket.sentiment) if ticket.sentiment else "Neutral",
                    "context_summary": esc_details["context_summary"]
                }
            )

        else:
            # ── 6. RAG response generation ──────────────────────────────────
            direct_result = await generate_direct_response(
                message=clean_message,
                category=_enum_value(ticket.category) if ticket.category else "General",
                sentiment=_enum_value(ticket.sentiment) if ticket.sentiment else "Neutral",
            )
            log_action(
                db, action="direct_support", ticket_id=ticket.id,
                model_used=direct_result["model"],
                input_tokens=direct_result["input_tokens"],
                output_tokens=direct_result["output_tokens"],
                cost_usd=direct_result["cost_usd"],
            )

            # RAG timed out → escalate
            if direct_result.get("timed_out") or direct_result.get("needs_human_review"):
                ticket.status = TicketStatus.ESCALATED
                
                esc_details = await generate_escalation_details(
                    message=clean_message,
                    category=_enum_value(ticket.category) if ticket.category else "General",
                    sentiment=_enum_value(ticket.sentiment) if ticket.sentiment else "Neutral"
                )
                
                escalation = Escalation(
                    ticket_id=ticket.id,
                    reason="Direct support pipeline timeout or error",
                    context_summary=esc_details["context_summary"],
                    suggested_reply=esc_details["suggested_reply"]
                )
                db.add(escalation)
                db.flush()
                
                response_text = esc_details.get("calming_message", "We encountered an issue processing your request. It has been escalated to a manager.")
                response_obj = Response(
                    ticket_id=ticket.id,
                    response_text=response_text,
                    citations=None,
                    quality_score=None,
                )
                db.add(response_obj)
                log_action(db, action="escalate", ticket_id=ticket.id)
                
                background_tasks.add_task(
                    manager.broadcast,
                    {
                        "event": "ticket_escalated",
                        "ticket_id": ticket.id,
                        "category": _enum_value(ticket.category) if ticket.category else "General",
                        "sentiment": _enum_value(ticket.sentiment) if ticket.sentiment else "Neutral",
                        "context_summary": esc_details["context_summary"]
                    }
                )
            else:
                response_obj = Response(
                    ticket_id=ticket.id,
                    response_text=direct_result["response"],
                    citations=direct_result.get("citations"),
                    quality_score=None,
                )
                db.add(response_obj)
                ticket.status = TicketStatus.RESOLVED
                ticket.resolved_at = datetime.now(timezone.utc)

                # ── 7. Quality scoring runs asynchronously ───────────────────
                background_tasks.add_task(
                    score_and_update,
                    ticket_id=ticket.id,
                    customer_message=clean_message,
                    ai_response=direct_result["response"],
                    db_session_factory=_db_factory,
                )

    except Exception as e:
        full_trace = traceback.format_exc()
        logger.error("Ticket pipeline error for user %d: %s\n%s", current_user.id, e, full_trace)

        # Log pipeline error
        try:
            db.add(AuditLog(
                ticket_id=ticket.id,
                action="pipeline_error",
                model_used="error",
                input_tokens=0,
                output_tokens=0,
                cost_usd=0.0,
            ))
        except Exception:
            pass

        # Escalate on any unhandled error
        ticket.status = TicketStatus.ESCALATED
        
        esc_details = {
            "context_summary": f"Unhandled error: {str(e)[:150]}",
            "suggested_reply": "Hello, thank you for your patience. A human agent is reviewing your support request."
        }
        
        if not db.query(Escalation).filter(Escalation.ticket_id == ticket.id).first():
            escalation = Escalation(
                ticket_id=ticket.id,
                reason=f"Pipeline error: {str(e)[:200]}",
                context_summary=esc_details["context_summary"],
                suggested_reply=esc_details["suggested_reply"]
            )
            db.add(escalation)
            db.flush()
            
        response_obj = db.query(Response).filter(Response.ticket_id == ticket.id).first()
        if not response_obj:
            response_obj = Response(
                ticket_id=ticket.id,
                response_text="Your request has been escalated to a human agent. You'll hear back shortly.",
                citations=None,
                quality_score=None,
            )
            db.add(response_obj)
            
        background_tasks.add_task(
            manager.broadcast,
            {
                "event": "ticket_escalated",
                "ticket_id": ticket.id,
                "category": _enum_value(ticket.category) if ticket.category else "General",
                "sentiment": _enum_value(ticket.sentiment) if ticket.sentiment else "Neutral",
                "context_summary": esc_details["context_summary"]
            }
        )

    # ── 8 & 9. Write to PostgreSQL (commit) & Start SLA timer ───────────────
    db.commit()
    db.refresh(ticket)
    db.refresh(response_obj)
    
    logger.info("SLA timer started for ticket %d at %s", ticket.id, ticket.created_at)

    # ── 10. Return: { response, category, sentiment, quality_score, citations } ──
    return FullPipelineResponse(
        id=ticket.id,
        response=response_obj.response_text,
        category=_enum_value(ticket.category) if ticket.category else None,
        sentiment=_enum_value(ticket.sentiment) if ticket.sentiment else None,
        quality_score=response_obj.quality_score,
        citations=response_obj.citations,
        status=_enum_value(ticket.status),
        handoff_to_manager=_enum_value(ticket.status) == TicketStatus.ESCALATED.value,
    )


# ─── GET /api/tickets ─────────────────────────────────────────────────────────

@router.get("/api/tickets", response_model=list[TicketOut])
async def list_tickets(
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List tickets. Customers see only their own; agents/managers see all."""
    query = db.query(Ticket)
    if current_user.role.value == "customer":
        query = query.filter(Ticket.user_id == current_user.id)
    if status:
        try:
            query = query.filter(Ticket.status == TicketStatus(status))
        except ValueError:
            raise HTTPException(400, f"Invalid status: {status}")
    tickets = query.order_by(Ticket.created_at.desc()).limit(100).all()
    return [
        TicketOut(
            id=t.id,
            user_id=t.user_id,
            customer_name=t.customer_name,
            customer_email=t.customer_email,
            message=t.message,
            category=_enum_value(t.category) if t.category else None,
            sentiment=_enum_value(t.sentiment) if t.sentiment else None,
            status=_enum_value(t.status),
            created_at=t.created_at,
            resolved_at=t.resolved_at,
        )
        for t in tickets
    ]


# ─── GET /api/tickets/{id} ────────────────────────────────────────────────────

@router.get("/api/tickets/{ticket_id}", response_model=TicketDetailOut)
async def get_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if current_user.role.value == "customer" and ticket.user_id != current_user.id:
        raise HTTPException(403, "Access denied")

    response_orm = ticket.response
    escalation_orm = ticket.escalation

    out = TicketDetailOut(
        id=ticket.id,
        user_id=ticket.user_id,
        customer_name=ticket.customer_name,
        customer_email=ticket.customer_email,
        message=ticket.message,
        category=_enum_value(ticket.category) if ticket.category else None,
        sentiment=_enum_value(ticket.sentiment) if ticket.sentiment else None,
        status=_enum_value(ticket.status),
        created_at=ticket.created_at,
        resolved_at=ticket.resolved_at,
        response=ResponseOut.model_validate(response_orm) if response_orm else None,
        escalation={
            "reason": escalation_orm.reason,
            "assigned_agent_id": escalation_orm.assigned_agent_id,
        } if escalation_orm else None,
    )
    return out


# ─── GET /agent/queue (agent role only) ───────────────────────────────────────

@router.get("/agent/queue", response_model=list[dict])
async def get_agent_queue(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """
    Returns all escalated tickets with AI-generated context summary and suggested reply.
    """
    escalated = (
        db.query(Ticket)
        .filter(Ticket.status == TicketStatus.ESCALATED)
        .order_by(Ticket.created_at.asc())  # FIFO queue
        .all()
    )

    result = []
    for t in escalated:
        item = {
            "ticket_id": t.id,
            "user_id": t.user_id,
            "customer_name": t.customer_name or _default_customer_name(t.user),
            "customer_email": t.customer_email or t.user.email,
            "message": t.message,
            "category": _enum_value(t.category) if t.category else None,
            "sentiment": _enum_value(t.sentiment) if t.sentiment else None,
            "created_at": t.created_at.isoformat(),
            "escalation_reason": t.escalation.reason if t.escalation else None,
            "assigned_agent_id": t.escalation.assigned_agent_id if t.escalation else None,
            "context_summary": t.escalation.context_summary if t.escalation else None,
            "suggested_reply": t.escalation.suggested_reply if t.escalation else None,
            "response_text": t.response.response_text if t.response else None,
        }
        
        # Self-heal context summary & suggested reply if missing
        if t.escalation and (not t.escalation.context_summary or not t.escalation.suggested_reply):
            try:
                esc_details = await generate_escalation_details(
                    t.message,
                    _enum_value(t.category) if t.category else "General",
                    _enum_value(t.sentiment) if t.sentiment else "Neutral"
                )
                t.escalation.context_summary = esc_details["context_summary"]
                t.escalation.suggested_reply = esc_details["suggested_reply"]
                db.commit()
                item["context_summary"] = esc_details["context_summary"]
                item["suggested_reply"] = esc_details["suggested_reply"]
            except Exception:
                db.rollback()
                
        result.append(item)

    return result


# ─── POST /agent/tickets/{ticket_id}/respond (agent role only) ────────────────

@router.post("/agent/tickets/{ticket_id}/respond")
async def respond_to_escalated_ticket(
    ticket_id: int,
    payload: AgentResponsePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager),
):
    """
    Agent submits a manual response to an escalated ticket.
    Ticket is marked resolved, and the response is updated.
    """
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(404, "Ticket not found")
        
    if ticket.status != TicketStatus.ESCALATED:
        raise HTTPException(400, "Ticket is not escalated")

    # Find or create response
    response_obj = db.query(Response).filter(Response.ticket_id == ticket_id).first()
    if response_obj:
        response_obj.response_text = payload.response_text
        response_obj.citations = None
        response_obj.quality_score = None  # Reset quality score for human response
    else:
        response_obj = Response(
            ticket_id=ticket_id,
            response_text=payload.response_text,
            citations=None,
            quality_score=None
        )
        db.add(response_obj)

    # Assign agent in escalation record
    if ticket.escalation:
        ticket.escalation.assigned_agent_id = current_user.id
    else:
        escalation = Escalation(
            ticket_id=ticket_id,
            reason="Manual escalation response",
            assigned_agent_id=current_user.id
        )
        db.add(escalation)

    ticket.status = TicketStatus.RESOLVED
    ticket.resolved_at = datetime.now(timezone.utc)
    
    # Audit log
    log_action(db, action="agent_respond", ticket_id=ticket_id)
    
    db.commit()
    
    # Broadcast to websocket that ticket was resolved
    await manager.broadcast({
        "event": "ticket_resolved",
        "ticket_id": ticket_id,
        "resolved_by": current_user.id
    })
    
    # Broadcast to user chat websocket
    await chat_manager.send_personal_message({
        "event": "agent_replied",
        "ticket_id": ticket_id,
        "response_text": payload.response_text,
        "resolved_by": current_user.id,
        "status": "resolved"
    }, ticket.user_id)
    
    return {"message": "Response submitted and ticket marked resolved successfully."}


# ─── POST /api/tickets/{ticket_id}/feedback ──────────────────────────────────

class FeedbackPayload(BaseModel):
    feedback_type: str  # "up" or "down"

@router.post("/api/tickets/{ticket_id}/feedback")
async def submit_ticket_feedback(
    ticket_id: int,
    payload: FeedbackPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Saves customer feedback (thumbs up/down) for a ticket response.
    Updates the quality_score (positive increases it, negative decreases it)
    and logs the action in audit_logs.
    """
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(404, "Ticket not found")
        
    if current_user.role.value == "customer" and ticket.user_id != current_user.id:
        raise HTTPException(403, "Access denied")

    response_obj = ticket.response
    if not response_obj:
        raise HTTPException(400, "No response exists for this ticket yet")

    # Log in audit logs
    action = f"feedback_{payload.feedback_type}"
    log_action(db, action=action, ticket_id=ticket_id)
    
    # Adjust score
    if response_obj.quality_score is not None:
        if payload.feedback_type == "up":
            response_obj.quality_score = min(10.0, response_obj.quality_score + 1.0)
        elif payload.feedback_type == "down":
            response_obj.quality_score = max(1.0, response_obj.quality_score - 1.0)
    else:
        response_obj.quality_score = 8.0 if payload.feedback_type == "up" else 3.0

    db.commit()
    return {"message": "Feedback submitted successfully."}


# ─── WebSocket /ws/agent/queue (agent queue notification) ─────────────────────

@router.websocket("/ws/agent/queue")
async def websocket_agent_queue(websocket: WebSocket):
    """
    WebSocket endpoint for agents to receive real-time queue updates.
    Expects token query parameter: ws://.../ws/agent/queue?token=<JWT_TOKEN>
    """
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001)
        return

    # Authenticate token
    from auth.security import decode_token
    db = SessionLocal()
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        if not user_id:
            await websocket.close(code=4003)
            db.close()
            return
        
        user = db.query(User).filter(User.id == int(user_id)).first()
        if not user or user.role.value not in ["manager", "admin"]:
            await websocket.close(code=4003)
            db.close()
            return
    except Exception:
        await websocket.close(code=4001)
        db.close()
        return

    await manager.connect(websocket)
    try:
        while True:
            # Receive data to keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error("WebSocket connection error: %s", e)
        manager.disconnect(websocket)
    finally:
        db.close()


# ─── WebSocket /ws/chat (customer live chat) ──────────────────────────────────

@router.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    """
    WebSocket endpoint for customers to receive real-time agent replies.
    Expects token query parameter: ws://.../ws/chat?token=<JWT_TOKEN>
    """
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001)
        return

    # Authenticate token
    from auth.security import decode_token
    db = SessionLocal()
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        if not user_id:
            await websocket.close(code=4003)
            db.close()
            return
        user_id_int = int(user_id)
        user = db.query(User).filter(User.id == user_id_int).first()
        if not user or user.role.value != "customer":
            await websocket.close(code=4003)
            db.close()
            return
    except Exception:
        await websocket.close(code=4001)
        db.close()
        return

    await chat_manager.connect(websocket, user_id_int)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        chat_manager.disconnect(websocket, user_id_int)
    except Exception as e:
        logger.error("User WebSocket connection error: %s", e)
        chat_manager.disconnect(websocket, user_id_int)
    finally:
        db.close()
