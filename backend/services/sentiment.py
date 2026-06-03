"""
Sentiment detection chain.
Input: ticket message
Output: { sentiment: Happy|Neutral|Frustrated|Angry, tone_score: float, escalate: bool }

Angry → immediate escalation, skip RAG.
Timeout → flag for human review.
"""
import logging
from services.groq_client import call_llm_with_json_retry

logger = logging.getLogger(__name__)

ALLOWED_SENTIMENTS = {"Happy", "Neutral", "Frustrated", "Angry"}

SENTIMENT_SYSTEM_PROMPT = """You are a highly sensitive sentiment analysis specialist for customer support. 
Carefully analyze the emotional tone of the user's message. Pay close attention to subtle negative emotion, impatience, or frustration.

Classify the tone as exactly one of:
- Happy
- Neutral
- Frustrated
- Angry

Output a JSON object with exactly three keys:
- "sentiment": one of the four values above (exact spelling, capitalised)
- "tone_score": float from -1.0 (extremely angry) to 1.0 (very happy), 0.0 = neutral
- "escalate": boolean — true ONLY when sentiment is Angry

Few-shot examples:
User: "Thanks so much, this worked perfectly!"
Output: {"sentiment": "Happy", "tone_score": 0.9, "escalate": false}

User: "I need help with my order"
Output: {"sentiment": "Neutral", "tone_score": 0.0, "escalate": false}

User: "Why is this not working? I've been waiting forever!"
Output: {"sentiment": "Frustrated", "tone_score": -0.6, "escalate": false}

User: "This is completely unacceptable! Fix this right now!"
Output: {"sentiment": "Angry", "tone_score": -0.9, "escalate": true}

Rules:
- Be highly responsive to negative words (e.g., 'not working', 'why', 'forever', 'unacceptable').
- If the user shows any sign of impatience or annoyance, classify as Frustrated or Angry, NOT Neutral.
- Output ONLY the JSON object. Do not include markdown blocks or text.
"""


async def detect_sentiment(message: str) -> dict:
    """
    Detects sentiment of a support message.

    Returns:
        sentiment, tone_score, escalate, input_tokens, output_tokens, cost_usd,
        model, timed_out, needs_human_review
    """
    data, result = await call_llm_with_json_retry(
        system_prompt=SENTIMENT_SYSTEM_PROMPT,
        user_message=message,
        max_tokens=80,
        temperature=0.0,
    )

    if result.timed_out:
        logger.warning("Sentiment detection timed out — flagging for human review")
        return _fallback(timed_out=True)

    if data is None:
        logger.warning("Sentiment JSON failed after retry — defaulting to Neutral")
        return _fallback(model=result.model, input_tokens=result.input_tokens,
                         output_tokens=result.output_tokens, cost_usd=result.cost_usd)

    sentiment = data.get("sentiment", "Neutral")
    if sentiment not in ALLOWED_SENTIMENTS:
        logger.warning("Invalid sentiment '%s' — defaulting to Neutral", sentiment)
        sentiment = "Neutral"

    # Always escalate on Angry regardless of model's flag
    escalate = sentiment == "Angry" or bool(data.get("escalate", False))

    return {
        "sentiment": sentiment,
        "tone_score": float(data.get("tone_score", 0.0)),
        "escalate": escalate,
        "input_tokens": result.input_tokens,
        "output_tokens": result.output_tokens,
        "cost_usd": result.cost_usd,
        "model": result.model,
        "timed_out": False,
        "needs_human_review": False,
    }


def _fallback(timed_out=False, model="fallback", input_tokens=0, output_tokens=0, cost_usd=0.0):
    return {
        "sentiment": "Neutral",
        "tone_score": 0.0,
        "escalate": False,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cost_usd": cost_usd,
        "model": model,
        "timed_out": timed_out,
        "needs_human_review": timed_out,
    }
