"""
Groq API client — retry logic, timeout detection, cost tracking.
Uses LangChain's ChatGroq for automatic LangSmith tracing integration.

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

from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage
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

# LangChain ChatGroq client — initialized on demand


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
    retry=retry_if_exception_type((Exception,)),
    reraise=True,
)
def _groq_call(
    system_prompt: str,
    user_message: str,
    max_tokens: int,
    temperature: float,
) -> LLMResponse:
    """
    Raw Groq call via LangChain ChatGroq with retry on transient errors.
    This is a SYNCHRONOUS function wrapped by asyncio.to_thread() in call_llm().
    ChatGroq automatically integrates with LangSmith tracing.
    """
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_message),
    ]
    
    try:
        # Create a temporary ChatGroq instance with override parameters
        llm = ChatGroq(
            api_key=settings.GROQ_API_KEY,
            model=ACTIVE_MODEL,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        
        logger.debug(
            "Calling ChatGroq.invoke() with model=%s, temp=%f, max_tokens=%d",
            ACTIVE_MODEL, temperature, max_tokens
        )
        
        # Invoke synchronously
        # This automatically sends traces to LangSmith if configured
        response = llm.invoke(messages)
        
        # Extract usage info from response.response_metadata
        response_metadata = getattr(response, "response_metadata", {}) or {}
        token_usage = response_metadata.get("token_usage", {})
        
        input_tokens = token_usage.get("prompt_tokens", 0)
        output_tokens = token_usage.get("completion_tokens", 0)
        
        logger.info(
            "ChatGroq response: model=%s, tokens_in=%d, tokens_out=%d, content_len=%d",
            ACTIVE_MODEL, input_tokens, output_tokens, len(response.content or "")
        )
        
        return LLMResponse(
            content=response.content or "",
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            model=ACTIVE_MODEL,
        )
    except Exception as e:
        logger.error(
            "ChatGroq.invoke() failed: %s\nFull traceback:\n%s",
            e, traceback.format_exc()
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
    Makes a Groq chat completion call via LangChain ChatGroq with:
    - Automatic LangSmith tracing (if configured)
    - 10-second timeout (returns LLMFallbackResponse on timeout)
    - 3-retry exponential backoff on transient errors
    - Full exception logging

    Returns LLMResponse (or LLMFallbackResponse on timeout/failure after retries).
    Callers must check response.timed_out and handle accordingly.
    """
    if max_tokens is None:
        max_tokens = settings.MAX_TOKENS_PER_CALL

    try:
        result = await asyncio.wait_for(
            asyncio.to_thread(
                _groq_call,
                system_prompt,
                user_message,
                max_tokens,
                temperature,
            ),
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
