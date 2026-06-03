"""
Groq API client — retry logic, timeout detection, cost tracking.

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

from groq import AsyncGroq, APITimeoutError, APIStatusError
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    RetryError,
)

from config import settings

logger = logging.getLogger(__name__)

# Cost constants (USD per token)
INPUT_COST_PER_TOKEN = 0.59 / 1_000_000
OUTPUT_COST_PER_TOKEN = 0.79 / 1_000_000

# Per spec: llama3-70b-8192. Mapped to current live equivalent.
REQUESTED_MODEL = "llama3-70b-8192"
ACTIVE_MODEL = "llama-3.3-70b-versatile"

# Timeout: flag for human review if LLM takes > 10s
LLM_TIMEOUT_SECONDS = 10

_client = AsyncGroq(api_key=settings.GROQ_API_KEY)


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
        self.timed_out = False  # set by call_llm on timeout

    def json(self) -> Any:
        """
        Parse response content as JSON.
        Strips markdown code fences if the model wrapped the output.
        Raises ValueError on parse failure.
        """
        text = self.content.strip()
        # Strip ```json ... ``` or ``` ... ``` wrappers
        if text.startswith("```"):
            lines = text.split("\n")
            # Remove first line (```json or ```) and last line (```)
            text = "\n".join(lines[1:-1]).strip()
        return json.loads(text)


class LLMTimeoutError(Exception):
    """Raised when Groq call exceeds LLM_TIMEOUT_SECONDS."""
    pass


class LLMFallbackResponse(LLMResponse):
    """A pre-built fallback used when LLM is unavailable."""
    def __init__(self, reason: str = "timeout"):
        super().__init__(
            content="",
            input_tokens=0,
            output_tokens=0,
            model="fallback",
        )
        self.timed_out = reason == "timeout"
        self._reason = reason

    def json(self) -> Any:
        raise ValueError(f"Fallback response ({self._reason}) has no JSON content")


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    retry=retry_if_exception_type((APIStatusError, ConnectionError, OSError)),
    reraise=True,
)
async def _groq_call(
    model: str,
    messages: list,
    max_tokens: int,
    temperature: float,
) -> LLMResponse:
    """Raw Groq call with retry on transient errors. Timeout handled by caller."""
    completion = await _client.chat.completions.create(
        model=model,
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
    )
    choice = completion.choices[0]
    usage = completion.usage
    return LLMResponse(
        content=choice.message.content or "",
        input_tokens=usage.prompt_tokens,
        output_tokens=usage.completion_tokens,
        model=model,
    )


async def call_llm(
    system_prompt: str,
    user_message: str,
    model: str = ACTIVE_MODEL,
    max_tokens: Optional[int] = None,
    temperature: float = 0.1,
) -> LLMResponse:
    """
    Makes a Groq chat completion call with:
    - 10-second timeout (returns LLMFallbackResponse on timeout)
    - 3-retry exponential backoff on transient errors
    - Full exception logging

    Returns LLMResponse (or LLMFallbackResponse on timeout/failure after retries).
    Callers must check response.timed_out and handle accordingly.
    """
    if max_tokens is None:
        max_tokens = settings.MAX_TOKENS_PER_CALL

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]

    try:
        result = await asyncio.wait_for(
            _groq_call(model, messages, max_tokens, temperature),
            timeout=LLM_TIMEOUT_SECONDS,
        )
        return result

    except asyncio.TimeoutError:
        logger.error(
            "Groq call timed out after %ds (model=%s, tokens=%d)",
            LLM_TIMEOUT_SECONDS, model, max_tokens,
        )
        fb = LLMFallbackResponse(reason="timeout")
        fb.timed_out = True
        return fb

    except RetryError as e:
        logger.error("Groq call failed after 3 retries: %s\n%s", e, traceback.format_exc())
        return LLMFallbackResponse(reason="retry_exhausted")

    except Exception as e:
        logger.error("Groq call unexpected error: %s\n%s", e, traceback.format_exc())
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
    Returns (parsed_dict_or_None, raw_LLMResponse).
    """
    result = await call_llm(system_prompt, user_message, model, max_tokens, temperature)

    if result.timed_out or result.model == "fallback":
        return None, result

    # First parse attempt
    try:
        return result.json(), result
    except (ValueError, json.JSONDecodeError) as e:
        logger.warning("JSON parse failed on first attempt: %s. Content: %.200s", e, result.content)

    # Retry once with explicit JSON reminder
    retry_prompt = system_prompt + "\n\nCRITICAL: You MUST respond with valid JSON only. No text before or after the JSON object."
    result2 = await call_llm(retry_prompt, user_message, model, max_tokens, temperature=0.0)

    if result2.timed_out or result2.model == "fallback":
        return None, result2

    try:
        return result2.json(), result2
    except (ValueError, json.JSONDecodeError) as e:
        logger.error("JSON parse failed after retry: %s. Content: %.200s", e, result2.content)
        return None, result2
