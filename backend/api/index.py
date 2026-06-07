"""
Vercel serverless entry point for FastAPI backend.
Exports the app for Vercel to invoke.
"""
import sys
from pathlib import Path

# Add parent directory to path so imports work
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from main import app

# Vercel calls this handler for all requests
__all__ = ['app']
