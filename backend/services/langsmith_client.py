"""
LangSmith client for LLM tracing and monitoring.
Integrates with LangChain for automatic tracing of LLM calls.
"""
import logging
import os
from contextlib import contextmanager

from config import settings

logger = logging.getLogger(__name__)


def setup_langsmith() -> bool:
    """
    Initialize LangSmith environment variables.
    Returns True if successfully configured, False if disabled or missing API key.
    """
    if not settings.LANGSMITH_API_KEY:
        logger.info("LangSmith disabled: LANGSMITH_API_KEY not set")
        return False

    if not settings.LANGSMITH_TRACING:
        logger.info("LangSmith tracing disabled via config")
        return False

    # Set environment variables for LangChain auto-tracing
    os.environ["LANGSMITH_API_KEY"] = settings.LANGSMITH_API_KEY
    os.environ["LANGSMITH_PROJECT"] = settings.LANGSMITH_PROJECT
    os.environ["LANGSMITH_TRACING"] = "true"
    
    logger.info(
        "LangSmith initialized — project: %s, tracing enabled",
        settings.LANGSMITH_PROJECT,
    )
    return True


def test_langsmith_connection() -> dict:
    """
    Test LangSmith connection by making a simple API call.
    Returns connection status and details.
    """
    if not settings.LANGSMITH_API_KEY:
        return {
            "connected": False,
            "reason": "LANGSMITH_API_KEY not configured",
            "project": None,
        }

    try:
        from langsmith import Client
        
        client = Client(
            api_key=settings.LANGSMITH_API_KEY,
            api_url="https://api.smith.langchain.com",
        )
        
        # Test connection by listing projects
        projects = list(client.list_projects())
        
        logger.info(
            "LangSmith connection successful — %d projects found",
            len(projects),
        )
        
        return {
            "connected": True,
            "reason": "Connection successful",
            "project": settings.LANGSMITH_PROJECT,
            "projects_found": len(projects),
        }
    except ImportError:
        logger.warning("langsmith package not installed")
        return {
            "connected": False,
            "reason": "langsmith package not installed",
            "project": None,
        }
    except Exception as e:
        logger.error("LangSmith connection failed: %s", e)
        return {
            "connected": False,
            "reason": str(e),
            "project": settings.LANGSMITH_PROJECT,
        }


@contextmanager
def trace_context(name: str, metadata: dict = None):
    """
    Context manager for manual tracing spans (optional).
    Usage:
        with trace_context("classify_ticket", {"user_id": 123}):
            result = await classify_ticket(message)
    """
    if not settings.LANGSMITH_TRACING or not settings.LANGSMITH_API_KEY:
        # Disabled — yield without tracing
        yield
        return

    try:
        from langsmith import trace
        
        with trace(
            name=name,
            inputs={"metadata": metadata or {}},
            run_type="chain",
        ) as run:
            yield run
    except ImportError:
        logger.debug("langsmith not available for manual tracing")
        yield
    except Exception as e:
        logger.warning("Manual tracing failed: %s", e)
        yield
