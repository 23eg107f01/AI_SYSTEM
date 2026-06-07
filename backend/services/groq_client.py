"""
Groq API client with retry logic, timeout detection, and cost tracking.

Model: llama3-70b-8192 (mapped to llama-3.3-70b-versatile, the current replacement)
Pricing (llama-3.3-70b-versatile):
  Input:  $0.59 / 1M tokens
  Output: $0.79 / 1M tokens
"""
import asyncio
import json
import logging
import traceback
from typing import Any, Optional

from groq import Groq
from tenacity import (
    RetryError,
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from config import settings

logger = logging.getLogger(__name__)

INPUT_COST_PER_TOKEN = 0.59 / 1_000_000
OUTPUT_COST_PER_TOKEN = 0.79 / 1_000_000

REQUESTED_MODEL = "llama3-70b-8192"
ACTIVE_MODEL = "llama-3.3-70b-versatile"

LLM_TIMEOUT_SECONDS = 10


class LLMResponse:
    """Wraps a Groq completion with token usage and cost metadata."""

    def __init__(self, content: str, input_tokens: int, output_tokens: int, model: str):
        self.content = content
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens
        self.model = model
        self.cost_usd = (
            input_tokens * INPUT_COST_PER_TOKEN
            + output_tokens * OUTPUT_COST_PER_TOKEN
        )
        self.timed_out = False

    def json(self) -> Any:
        text = self.content.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1]).strip()
        return json.loads(text)


class LLMFallbackResponse(LLMResponse):
    """A pre-built fallback used when the LLM is unavailable."""

    def __init__(self, reason: str = "timeout"):
        super().__init__(content="", input_tokens=0, output_tokens=0, model="fallback")
        self.timed_out = reason == "timeout"
        self._reason = reason

    def json(self) -> Any:
        raise ValueError(f"Fallback response ({self._reason}) has no JSON content")


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    retry=retry_if_exception_type((Exception,)),
    reraise=True,
)
def _groq_call(
    system_prompt: str,
    user_message: str,
    max_tokens: int,
    temperature: float,
) -> LLMResponse:
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]

    try:
        client = Groq(api_key=settings.GROQ_API_KEY)
        response = client.chat.completions.create(
            messages=messages,
            model=ACTIVE_MODEL,
            temperature=temperature,
            max_tokens=max_tokens,
        )

        usage = getattr(response, "usage", None)
        input_tokens = getattr(usage, "prompt_tokens", 0) or 0
        output_tokens = getattr(usage, "completion_tokens", 0) or 0
        content = ""
        if getattr(response, "choices", None):
            content = response.choices[0].message.content or ""

        logger.info(
            "Groq response: model=%s, tokens_in=%d, tokens_out=%d, content_len=%d",
            ACTIVE_MODEL,
            input_tokens,
            output_tokens,
            len(content),
        )

        return LLMResponse(
            content=content,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            model=ACTIVE_MODEL,
        )
    except Exception as exc:
        logger.error(
            "Groq chat completion failed: %s\nFull traceback:\n%s",
            exc,
            traceback.format_exc(),
        )
        raise


async def call_llm(
    system_prompt: str,
    user_message: str,
    model: str = ACTIVE_MODEL,
    max_tokens: Optional[int] = None,
    temperature: float = 0.1,
) -> LLMResponse:
    """
    Makes a Groq chat completion call with timeout and retry handling.
    """
    if max_tokens is None:
        max_tokens = settings.MAX_TOKENS_PER_CALL

    try:
        return await asyncio.wait_for(
            asyncio.to_thread(
                _groq_call,
                system_prompt,
                user_message,
                max_tokens,
                temperature,
            ),
            timeout=LLM_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.error(
            "Groq call timed out after %ds (model=%s, tokens=%d)",
            LLM_TIMEOUT_SECONDS,
            model,
            max_tokens,
        )
        return LLMFallbackResponse(reason="timeout")
    except RetryError as exc:
        logger.error("Groq call failed after 3 retries: %s\n%s", exc, traceback.format_exc())
        return LLMFallbackResponse(reason="retry_exhausted")
    except Exception as exc:
        logger.error("Groq call unexpected error: %s\n%s", exc, traceback.format_exc())
        return LLMFallbackResponse(reason="error")


async def call_llm_with_json_retry(
    system_prompt: str,
    user_message: str,
    model: str = ACTIVE_MODEL,
    max_tokens: Optional[int] = None,
    temperature: float = 0.1,
) -> tuple[Optional[dict], LLMResponse]:
    """
    Calls the LLM and parses JSON output.
    If JSON parsing fails on the first attempt, retries once with a stricter prompt.
    """
    result = await call_llm(system_prompt, user_message, model, max_tokens, temperature)

    if result.timed_out or result.model == "fallback":
        return None, result

    try:
        return result.json(), result
    except (ValueError, json.JSONDecodeError) as exc:
        logger.warning("JSON parse failed on first attempt: %s. Content: %.200s", exc, result.content)

    retry_prompt = (
        system_prompt
        + "\n\nCRITICAL: You MUST respond with valid JSON only. No text before or after the JSON object."
    )
    result2 = await call_llm(retry_prompt, user_message, model, max_tokens, temperature=0.0)

    if result2.timed_out or result2.model == "fallback":
        return None, result2

    try:
        return result2.json(), result2
    except (ValueError, json.JSONDecodeError) as exc:
        logger.error("JSON parse failed after retry: %s. Content: %.200s", exc, result2.content)
        return None, result2
