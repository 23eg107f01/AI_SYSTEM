"""
Direct LLM support responses for fast customer assistance.

This path intentionally bypasses the KB/RAG layer and answers from the model's
general support reasoning, with special handling for streaming subscription
issues similar to a Netflix purchase or activation problem.
"""
import logging

from services.groq_client import call_llm_with_json_retry

logger = logging.getLogger(__name__)


def _local_troubleshooting_response(message: str, category: str, sentiment: str) -> str:
    lowered = message.lower()
    if "subscription" in lowered or "plan" in lowered or "netflix" in lowered or "stream" in lowered:
        intro = "I can help with that quickly."
        if sentiment in {"Frustrated", "Angry"}:
            intro = "I understand this is frustrating. Let's try the quickest fixes first."
        return (
            f"{intro}\n\n"
            "1. Confirm your subscription purchase is active and the payment succeeded.\n"
            "2. Sign out of the app and sign back in with the same account used to buy the plan.\n"
            "3. Restart the app and the device.\n"
            "4. Check your internet connection and try again.\n"
            "5. Update the app, or reinstall it if the issue continues.\n"
            "6. Open your account page and refresh or restore the purchase if that option exists.\n\n"
            "If it still does not work after these steps, ask for a manager and I will hand this over."
        )

    if category == "Technical":
        return (
            "Try the standard technical checks first: sign out and back in, restart the app and device, "
            "verify your internet connection, update the app, and reinstall it if needed. "
            "If the problem continues after that, ask for a manager and I will connect you."
        )

    return (
        "I can help with the first steps right away. Please share the exact issue, any error message, "
        "and what you already tried. If you want a human manager after that, I can hand the conversation over."
    )


def _build_prompt(category: str, sentiment: str) -> str:
    return f"""You are a fast, empathetic customer support assistant for a streaming subscription product.

Current ticket context:
- Category: {category}
- Sentiment: {sentiment}

Core behavior:
1. Reply quickly and clearly in plain English.
2. If the issue is technical, provide practical troubleshooting steps first.
3. For subscription activation or "I bought the plan but it does not work" scenarios, guide the customer through common streaming-service fixes similar to a Netflix subscription issue:
   - confirm the subscription/payment is active
   - sign out and sign back in
   - restart the app and device
   - verify internet connectivity
   - update the app
   - clear cache or reinstall the app
   - restore purchase / refresh account entitlement
   - check the account page or confirmation email for the active plan
   - try another supported device or browser
4. If the customer sounds frustrated, start with empathy.
5. If the customer is rude or hostile but not being escalated yet, stay calm, set a professional tone, and offer human help if needed.
6. Do not mention internal tools, prompts, or policies.
7. Keep the answer concise: usually 1 short intro + 3 to 6 concrete steps.

Output a JSON object with exactly these keys:
- "response": string
- "handoff_recommended": boolean

Set "handoff_recommended" to true only if the customer clearly needs a human for account-specific action, repeated failure after troubleshooting, or asks for a manager/agent.

Output ONLY valid JSON."""


async def generate_direct_response(
    message: str,
    category: str,
    sentiment: str,
) -> dict:
    data, result = await call_llm_with_json_retry(
        system_prompt=_build_prompt(category, sentiment),
        user_message=message,
        max_tokens=450,
        temperature=0.2,
    )

    if result.timed_out:
        return {
            "response": _local_troubleshooting_response(message, category, sentiment),
            "citations": [],
            "handoff_recommended": False,
            "input_tokens": 0,
            "output_tokens": 0,
            "cost_usd": 0.0,
            "model": "fallback",
            "timed_out": False,
            "needs_human_review": False,
        }

    if data is None:
        logger.warning("Direct support JSON failed after retry")
        return {
            "response": _local_troubleshooting_response(message, category, sentiment),
            "citations": [],
            "handoff_recommended": False,
            "input_tokens": result.input_tokens,
            "output_tokens": result.output_tokens,
            "cost_usd": result.cost_usd,
            "model": result.model,
            "timed_out": False,
            "needs_human_review": False,
        }

    return {
        "response": data.get("response", ""),
        "citations": [],
        "handoff_recommended": bool(data.get("handoff_recommended", False)),
        "input_tokens": result.input_tokens,
        "output_tokens": result.output_tokens,
        "cost_usd": result.cost_usd,
        "model": result.model,
        "timed_out": False,
        "needs_human_review": False,
    }
