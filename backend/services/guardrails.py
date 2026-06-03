"""
Input sanitization and prompt injection defense.
"""
import re
import logging

logger = logging.getLogger(__name__)

MAX_MESSAGE_LENGTH = 1000

# Patterns that indicate a prompt injection attempt
INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?(previous|prior|above)\s+instructions?",
    r"jailbreak",
    r"\bDAN\b",
    r"pretend\s+you\s+are",
    r"you\s+are\s+now\s+(a\s+)?different",
    r"forget\s+(your|all)\s+(instructions?|rules?|guidelines?)",
    r"act\s+as\s+(if\s+you\s+(are|were)\s+)?a?\s*(different|new|uncensored)",
    r"disregard\s+(your\s+)?(previous|prior|system)\s+(prompt|instructions?)",
    r"reveal\s+(your\s+)?(system\s+)?(prompt|instructions?)",
    r"override\s+(your\s+)?(instructions?|guidelines?)",
]

# Credit card pattern (16-digit numbers, various separators)
CREDIT_CARD_PATTERN = re.compile(r"\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b")

# HTML / script tags
HTML_PATTERN = re.compile(r"<[^>]+>", re.IGNORECASE)

COMPILED_INJECTION_PATTERNS = [
    re.compile(p, re.IGNORECASE) for p in INJECTION_PATTERNS
]


class SanitizationResult:
    def __init__(self, text: str, is_injection: bool, violations: list[str]):
        self.text = text
        self.is_injection = is_injection
        self.violations = violations


def sanitize_message(raw_message: str) -> SanitizationResult:
    """
    Sanitize and validate a user message.

    Steps:
    1. Trim whitespace
    2. Enforce max length
    3. Strip HTML tags
    4. Redact credit card numbers
    5. Check for prompt injection patterns

    Returns:
        SanitizationResult with cleaned text and injection flag.
    """
    violations: list[str] = []

    # 1. Trim
    text = raw_message.strip()

    # 2. Length limit
    if len(text) > MAX_MESSAGE_LENGTH:
        logger.warning("Message truncated from %d to %d chars", len(text), MAX_MESSAGE_LENGTH)
        text = text[:MAX_MESSAGE_LENGTH]
        violations.append("message_too_long")

    # 3. Strip HTML
    cleaned = HTML_PATTERN.sub("", text)
    if cleaned != text:
        violations.append("html_stripped")
        text = cleaned

    # 4. Redact credit card numbers
    redacted, count = CREDIT_CARD_PATTERN.subn("[REDACTED-CARD]", text)
    if count > 0:
        violations.append(f"credit_card_redacted:{count}")
        text = redacted

    # 5. Injection detection
    is_injection = False
    for pattern in COMPILED_INJECTION_PATTERNS:
        if pattern.search(text):
            is_injection = True
            violations.append(f"injection_pattern:{pattern.pattern[:40]}")
            logger.warning("Prompt injection attempt detected: %s", text[:100])
            break

    return SanitizationResult(text=text, is_injection=is_injection, violations=violations)
