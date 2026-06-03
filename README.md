# AI Customer Support Automation System

Intelligent support ticket automation with RAG, sentiment detection, escalation, and a manager dashboard.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TailwindCSS + Recharts |
| Backend | FastAPI + Python 3.11 + Uvicorn |
| Auth | JWT (access 30min / refresh 7d) + bcrypt + Redis |
| LLM | Groq API (llama3-70b-8192) |
| Embeddings | sentence-transformers/all-MiniLM-L6-v2 (local) |
| Vector DB | ChromaDB (persistent) |
| Relational DB | PostgreSQL 15 via SQLAlchemy + Alembic |
| Cache | Redis 7 (TTL-based token store) |

## Quick Start (Docker)

```bash
# 1. Clone and copy env file
cp backend/.env.example backend/.env
# Edit backend/.env and add your GROQ_API_KEY

# 2. Start all services
docker-compose up --build

# 3. Run DB migrations (first time only)
docker exec aicsa-backend alembic upgrade head

# 4. Ingest knowledge base documents (optional)
docker exec aicsa-backend python scripts/ingest_kb.py --folder /app/knowledge_base

# 5. Open the API docs
open http://localhost:8000/docs
```

## Local Development (without Docker)

```bash
# Backend
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
cp .env.example .env          # fill in values
alembic upgrade head
uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
cp .env.example .env
npm run dev
```

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /auth/register | Public | Create account |
| POST | /auth/login | Public | Get JWT tokens |
| POST | /auth/refresh | Public | Rotate tokens |
| POST | /auth/logout | JWT | Revoke tokens |
| POST | /api/tickets | JWT | Submit support ticket (full AI pipeline) |
| GET | /api/tickets | JWT | List tickets |
| GET | /api/tickets/{id} | JWT | Get ticket detail |
| POST | /api/kb/upload | Admin | Upload KB document |
| GET | /api/kb | JWT | List KB documents |
| DELETE | /api/kb/{id} | Admin | Delete document |
| GET | /api/dashboard/stats | Manager | Dashboard metrics |
| GET | /api/dashboard/audit | Manager | Audit log |
| GET | /api/dashboard/escalations | Agent+ | Escalation queue |
| PATCH | /api/dashboard/tickets/{id}/resolve | Agent+ | Resolve ticket |

## AI Pipeline (per ticket)

1. Input sanitization — strips HTML, detects injection attempts, redacts card numbers
2. Classification → Billing / Technical / Returns / General
3. Sentiment detection → Happy / Neutral / Frustrated / Angry
4. If Angry → auto-escalate to human queue
5. Else → ChromaDB similarity search (top-3 chunks) → RAG response
6. Quality scoring → Helpfulness + Clarity (1–10)
7. All LLM calls logged to audit_logs with token counts and cost
