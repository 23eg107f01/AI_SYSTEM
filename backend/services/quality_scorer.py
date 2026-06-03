"""
Quality Scoring chain.

Scores the AI-generated response on:
  Helpfulness (1-5) + Clarity (1-5) = total (2-10)

If total < 5 → flag ticket for agent review.
Runs as a FastAPI BackgroundTask (non-blocking).
"""
import logging
import traceback
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from services.groq_client import call_llm_with_json_retry

logger = logging.getLogger(__name__)

QUALITY_SYSTEM_PROMPT = """You are a quality assurance evaluator for customer support AI responses.

Evaluate the AI response to the customer message on two dimensions:

Helpfulness (1-5):
- 5: Completely resolves the issue with clear, actionable steps
- 3: Partially addresses the issue
- 1: Does not address the issue at all

Clarity (1-5):
- 5: Crystal clear, well-structured, professional tone
- 3: Understandable but could be improved
- 1: Confusing, vague, or poorly written

Output a JSON object with exactly four keys:
- "helpfulness": integer 1 to 5
- "clarity": integer 1 to 5
- "total": integer 2 to 10 (sum of helpfulness + clarity)
- "feedback": one sentence summarising the evaluation

Rules:
- Be objective and strict — reserve 5s for genuinely excellent responses
- Output ONLY the JSON object — no explanation, no markdown fences"""


async def score_response(customer_message: str, ai_response: str) -> dict:
    """
    Score an AI-generated response.

    Returns:
        helpfulness, clarity, total, feedback,
        input_tokens, output_tokens, cost_usd, model,
        timed_out, needs_human_review
    """
    evaluation_input = (
        f"CUSTOMER MESSAGE:\n{customer_message}\n\n"
        f"AI RESPONSE TO EVALUATE:\n{ai_response}"
    )

    data, result = await call_llm_with_json_retry(
        system_prompt=QUALITY_SYSTEM_PROMPT,
        user_message=evaluation_input,
        max_tokens=150,
        temperature=0.0,
    )

    if result.timed_out or data is None:
        logger.warning("Quality scoring unavailable (timed_out=%s, data=%s)", result.timed_out, data)
        return _fallback(timed_out=result.timed_out,
                         model=result.model,
                         input_tokens=result.input_tokens,
                         output_tokens=result.output_tokens,
                         cost_usd=result.cost_usd)

    helpfulness = max(1, min(5, int(data.get("helpfulness", 3))))
    clarity = max(1, min(5, int(data.get("clarity", 3))))
    total = helpfulness + clarity  # 2–10

    return {
        "helpfulness": helpfulness,
        "clarity": clarity,
        "total": float(total),
        "feedback": data.get("feedback", ""),
        "input_tokens": result.input_tokens,
        "output_tokens": result.output_tokens,
        "cost_usd": result.cost_usd,
        "model": result.model,
        "timed_out": False,
        "needs_human_review": total < 5,  # Flag low-quality responses
    }


async def score_and_update(
    ticket_id: int,
    customer_message: str,
    ai_response: str,
    db_session_factory,  # callable that returns a new Session
) -> None:
    """
    Background task: score the response and update the DB.
    Opens its own DB session — safe to run after the HTTP response is sent.

    If score < 5, marks the ticket for agent review.
    All errors logged to audit_logs with full stack trace.
    """
    from models.ticket import Response
    from services.audit import log_action

    db: Session = db_session_factory()
    try:
        quality = await score_response(customer_message, ai_response)

        # Update response quality_score
        resp = db.query(Response).filter(Response.ticket_id == ticket_id).first()
        if resp:
            resp.quality_score = quality["total"]

        # If low quality → flag ticket for agent review (revert to open/escalate)
        if quality["needs_human_review"]:
            logger.info(
                "Ticket %d scored low (%.1f/10) but remains resolved for manual review only",
                ticket_id, quality["total"],
            )

        log_action(
            db,
            action="quality",
            ticket_id=ticket_id,
            model_used=quality["model"],
            input_tokens=quality["input_tokens"],
            output_tokens=quality["output_tokens"],
            cost_usd=quality["cost_usd"],
        )

        db.commit()
        logger.info(
            "Quality score for ticket %d: %.1f/10 (h=%d, c=%d) — %s",
            ticket_id, quality["total"], quality["helpfulness"],
            quality["clarity"], quality["feedback"],
        )

    except Exception as e:
        db.rollback()
        # Log full stack trace to audit_logs
        full_trace = traceback.format_exc()
        logger.error("score_and_update failed for ticket %d: %s\n%s", ticket_id, e, full_trace)
        try:
            from models.ticket import AuditLog
            entry = AuditLog(
                ticket_id=ticket_id,
                action="quality_error",
                model_used="error",
                input_tokens=0,
                output_tokens=0,
                cost_usd=Decimal("0"),
            )
            db.add(entry)
            db.commit()
        except Exception:
            pass
    finally:
        db.close()


def _fallback(timed_out=False, model="fallback", input_tokens=0, output_tokens=0, cost_usd=0.0):
    return {
        "helpfulness": 0,
        "clarity": 0,
        "total": 0.0,
        "feedback": "Scoring unavailable",
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cost_usd": cost_usd,
        "model": model,
        "timed_out": timed_out,
        "needs_human_review": True,
    }
