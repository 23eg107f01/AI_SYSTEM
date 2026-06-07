"""
AI Customer Support Automation System — FastAPI entrypoint
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from config import settings
from db.base import engine, initialize_database
from db.redis_client import redis_client
from models import *  # noqa: F401, F403 — registers all models with SQLAlchemy
from auth.router import router as auth_router
from routes import tickets_router, kb_router, dashboard_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

# ─── Rate limiter ────────────────────────────────────────────────────────────
from utils.limiter import limiter


# ─── Startup / Shutdown ──────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting AI Customer Support System...")

    try:
        initialize_database()
        logger.info("Database initialization complete")
    except Exception as e:
        logger.exception("Database initialization failed: %s", e)
        raise
    
    # Initialize LangSmith tracing
    from services.langsmith_client import setup_langsmith, test_langsmith_connection
    langsmith_ok = setup_langsmith()
    if langsmith_ok:
        connection_status = test_langsmith_connection()
        logger.info("LangSmith status: %s", connection_status)
    
    if settings.REDIS_ENABLED and redis_client is not None:
        try:
            await redis_client.ping()
            logger.info("Redis connected")
        except Exception as e:
            logger.warning("Redis connection failed: %s", e)
    else:
        logger.info("Redis disabled; running in stateless auth mode")

    # Start SLA tracker background job
    from services.sla_tracker import start_sla_tracker
    start_sla_tracker()

    yield

    logger.info("Shutting down...")
    if redis_client is not None:
        await redis_client.aclose()


# ─── App ─────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="AI Customer Support Automation System",
    description="Intelligent support ticket automation with RAG, sentiment detection, and escalation.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Rate limit error handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — allow configured origins only
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


# ─── Global exception handler ────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Our assistant is temporarily unavailable. A human agent will respond shortly."
        },
    )


# ─── Routers ─────────────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(tickets_router)
app.include_router(kb_router)
app.include_router(dashboard_router)


# ─── Health check ────────────────────────────────────────────────────────────
@app.get("/health", tags=["system"])
async def health():
    from sqlalchemy import text
    from db.base import SessionLocal
    
    db_status = "ok"
    db_error = None
    
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
    except Exception as e:
        db_status = "error"
        db_error = str(e)
    
    return {
        "status": "ok", 
        "version": "1.0.0",
        "database": {
            "status": db_status,
            "error": db_error
        }
    }


# ─── LangSmith connection check ───────────────────────────────────────────────
@app.get("/health/langsmith", tags=["system"])
async def langsmith_health():
    """Check LangSmith tracing connection status."""
    from services.langsmith_client import test_langsmith_connection
    
    result = test_langsmith_connection()
    status_code = status.HTTP_200_OK if result["connected"] else status.HTTP_503_SERVICE_UNAVAILABLE
    
    return {
        "service": "langsmith",
        "connected": result["connected"],
        "reason": result["reason"],
        "project": result.get("project"),
        "projects_found": result.get("projects_found"),
    }


@app.get("/", tags=["system"])
async def root():
    return {
        "message": "AI Customer Support Automation System",
        "docs": "/docs",
        "health": "/health",
    }
