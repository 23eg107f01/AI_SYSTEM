# LangSmith Integration Guide

## Overview

**LangSmith** is a monitoring and debugging platform for LLM applications. It provides:
- **Tracing**: Automatic logging of all LLM API calls (Groq)
- **Debugging**: View request/response flows and token usage
- **Monitoring**: Track performance metrics and cost
- **Projects**: Organize runs by project for analysis

## Setup Instructions

### 1. Get LangSmith API Key

1. Go to [smith.langchain.com](https://smith.langchain.com)
2. Sign up or log in
3. Navigate to **Settings** → **API Keys**
4. Copy your API key

### 2. Add to Backend Configuration

Edit `backend/.env` and add your LangSmith API key:

```env
# ─── LangSmith (LLM Tracing) ────────────────────────────────────────────────
LANGSMITH_API_KEY=lsv_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
LANGSMITH_PROJECT=ai-customer-support
LANGSMITH_TRACING=true
```

**Parameters:**
- `LANGSMITH_API_KEY`: Your API key from smith.langchain.com (required for tracing)
- `LANGSMITH_PROJECT`: Project name to organize runs (default: `ai-customer-support`)
- `LANGSMITH_TRACING`: Enable/disable tracing (default: `true`)

### 3. Verify Installation

The `langsmith` package is already in `requirements.txt`. Ensure it's installed:

```bash
cd backend
pip install langsmith
```

### 4. Test the Connection

Restart the backend:

```bash
cd backend
uvicorn main:app --reload --port 8000
```

**Check the startup logs:**
```
2026-06-04 23:39:31,439 | INFO | services.langsmith_client | LangSmith initialized — project: ai-customer-support, tracing enabled
```

**Test the health endpoint:**

```bash
# In a new terminal:
curl http://127.0.0.1:8000/health/langsmith
```

**Expected successful response:**
```json
{
  "service": "langsmith",
  "connected": true,
  "reason": "Connection successful",
  "project": "ai-customer-support",
  "projects_found": 1
}
```

## What Gets Traced

Once configured, the following are automatically captured:

### Groq LLM Calls
- **Classification** (`classify_ticket`) → categorizes support ticket
- **Sentiment Detection** (`detect_sentiment`) → analyzes customer emotion
- **Direct Response** (`generate_direct_response`) → RAG-based answer
- **Escalation Details** (`generate_escalation_details`) → manager context

### Traced Metadata
- Request tokens
- Response tokens
- Token cost (USD)
- Execution time
- Success/failure status
- Error messages

### View in LangSmith

1. Go to [smith.langchain.com](https://smith.langchain.com)
2. Select your project: **ai-customer-support**
3. View all runs with full request/response details

## Manual Tracing (Optional)

You can add custom spans for additional context:

```python
from services.langsmith_client import trace_context

async def my_function():
    with trace_context("my_operation", {"user_id": 123}):
        result = await some_operation()
    return result
```

## Disabling LangSmith

To disable tracing without removing the config:

**Option 1:** Remove the API key from `.env`
```env
LANGSMITH_API_KEY=
```

**Option 2:** Set tracing to false
```env
LANGSMITH_TRACING=false
```

The backend will start without tracing but all code remains in place.

## Troubleshooting

### Connection Fails with 401 Unauthorized
- **Cause**: Invalid or expired API key
- **Fix**: Verify your API key at [smith.langchain.com/settings](https://smith.langchain.com/settings)

### No Runs Appear in LangSmith
- **Cause**: Tracing might be disabled or LLM calls not being made
- **Check**:
  - `LANGSMITH_TRACING=true` in `.env`
  - `LANGSMITH_API_KEY` is set
  - Backend logs show "LangSmith initialized"
  - Make actual ticket requests: `POST /api/tickets`

### Package Import Error
- **Cause**: `langsmith` not installed
- **Fix**: Run `pip install langsmith`

## Performance Notes

- **Minimal overhead**: <10ms per trace upload
- **Async**: Tracing happens in background, doesn't block responses
- **Cost**: Free tier covers ~100 traces/month; paid plans for production

## Reference

- [LangSmith Documentation](https://docs.smith.langchain.com)
- [LangChain Tracing Guide](https://python.langchain.com/docs/how_to/debugging/tracing)
- [API Key Management](https://smith.langchain.com/settings)
