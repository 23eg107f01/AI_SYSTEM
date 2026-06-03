from sqlalchemy import (
    Column, Integer, String, Text, DateTime,
    Enum, ForeignKey, JSON, Float, Numeric
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from db.base import Base
import enum


class TicketCategory(str, enum.Enum):
    BILLING = "Billing"
    TECHNICAL = "Technical"
    RETURNS = "Returns"
    GENERAL = "General"
    LEGAL = "Legal/Compliance"



class TicketSentiment(str, enum.Enum):
    HAPPY = "Happy"
    NEUTRAL = "Neutral"
    FRUSTRATED = "Frustrated"
    ANGRY = "Angry"


class TicketStatus(str, enum.Enum):
    OPEN = "open"
    ESCALATED = "escalated"
    RESOLVED = "resolved"


class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    customer_name = Column(String(255), nullable=True)
    customer_email = Column(String(255), nullable=True)
    message = Column(Text, nullable=False)
    category = Column(Enum(TicketCategory, values_callable=lambda x: [e.value for e in x]), nullable=True)
    sentiment = Column(Enum(TicketSentiment, values_callable=lambda x: [e.value for e in x]), nullable=True)
    status = Column(Enum(TicketStatus, values_callable=lambda x: [e.value for e in x]), default=TicketStatus.OPEN, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    user = relationship("User", backref="tickets")
    response = relationship("Response", back_populates="ticket", uselist=False)
    escalation = relationship("Escalation", back_populates="ticket", uselist=False)
    audit_logs = relationship("AuditLog", back_populates="ticket")

    def __repr__(self):
        return f"<Ticket(id={self.id}, category={self.category}, status={self.status})>"


class Response(Base):
    __tablename__ = "responses"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False, unique=True, index=True)
    response_text = Column(Text, nullable=False)
    citations = Column(JSON, nullable=True)          # list of {source, chunk_id, text}
    quality_score = Column(Float, nullable=True)     # 1–10
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    ticket = relationship("Ticket", back_populates="response")

    def __repr__(self):
        return f"<Response(id={self.id}, ticket_id={self.ticket_id}, quality={self.quality_score})>"


class Escalation(Base):
    __tablename__ = "escalations"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False, unique=True, index=True)
    reason = Column(String(500), nullable=False)
    assigned_agent_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    context_summary = Column(Text, nullable=True)
    suggested_reply = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


    ticket = relationship("Ticket", back_populates="escalation")
    assigned_agent = relationship("User", foreign_keys=[assigned_agent_id])

    def __repr__(self):
        return f"<Escalation(id={self.id}, ticket_id={self.ticket_id}, reason={self.reason})>"


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=True, index=True)
    action = Column(String(100), nullable=False)          # classify | sentiment | rag | quality | escalate
    model_used = Column(String(100), nullable=True)
    input_tokens = Column(Integer, nullable=True)
    output_tokens = Column(Integer, nullable=True)
    cost_usd = Column(Numeric(10, 6), nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    ticket = relationship("Ticket", back_populates="audit_logs")

    def __repr__(self):
        return f"<AuditLog(id={self.id}, action={self.action}, cost={self.cost_usd})>"


class KBDocument(Base):
    __tablename__ = "kb_documents"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255), nullable=False)
    category = Column(String(100), nullable=True)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    status = Column(String(50), default="pending", nullable=False)  # pending | processing | ready | error

    def __repr__(self):
        return f"<KBDocument(id={self.id}, filename={self.filename}, status={self.status})>"
