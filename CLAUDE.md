# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

UzGidroChat — corporate messenger for Uzbekgidroenergo. Two-tier app: Python/FastAPI backend + Angular 21 frontend, deployable via Docker Compose or as a standalone Electron desktop app.

## Commands

### Run everything (Docker)
```bash
docker-compose up --build
```
App is served on port 80. Nginx proxies `/api/*` to the backend, `/ws/*` for WebSockets.

### Backend only (local dev)
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
Requires a running PostgreSQL instance. Configure via env vars: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_HOST`, `SECRET_KEY`.

### Frontend (local dev)
```bash
cd desktop/uzgidrochat-app
npm ci
npm start          # Angular dev server (ng serve)
npm run electron   # Build Angular + launch Electron
npm run electron-dev  # Electron pointing at dev build
npm run dist       # Build + package with electron-builder (Windows NSIS installer)
```

### Tests
```bash
cd desktop/uzgidrochat-app && npm test   # Angular tests (Karma)
```
No backend test suite currently exists.

## Architecture

### Backend (`backend/`)
Single FastAPI app in `main.py` — all REST endpoints defined there (no router splitting). Tables auto-created via `Base.metadata.create_all()` at startup.

- **database.py** — SQLAlchemy engine/session setup, `get_db` dependency
- **models.py** — Three SQLAlchemy models: `User`, `Group`, `Message`. Groups use a many-to-many `group_members` association table. Messages support DM (via `receiver_id`), group chat (via `group_id`), file attachments, replies, and soft-delete.
- **schemas.py** — Pydantic request/response models
- **auth.py** — bcrypt password hashing + JWT (python-jose). Tokens expire in 24h.
- **websocket_manager.py** — `ConnectionManager` singleton tracking active WebSocket connections by user_id. Handles personal messages, broadcast, and typing indicators.

WebSocket endpoint: `/ws/{user_id}`. Manages online/offline status and typing events.

File uploads go to `backend/uploads/` (mounted as a Docker volume).

### Frontend (`desktop/uzgidrochat-app/`)
Angular 21 standalone app with PrimeNG + PrimeFlex UI components.

- **Routes** (`app.routes.ts`): `/login`, `/register`, `/chat` (default redirects to `/login`)
- **Services**: `AuthService` (login/register/token in localStorage), `ChatService` (REST calls + raw WebSocket management)
- **Components**: `LoginComponent`, `RegisterComponent`, `ChatComponent`

Dual-mode API base URL: in Electron, services connect directly to the backend host configured in `preload.js`; in browser, they use relative URLs proxied by Nginx.

### Nginx (`nginx/nginx.conf`)
Reverse proxy config: strips `/api/` prefix before forwarding to backend:8000. WebSocket upgrade support on `/ws/`.

## Key Patterns

- No Alembic migrations — schema managed by `create_all()`. Any model change requires either recreating the DB or manual migration.
- No auth middleware on most endpoints — `user_id` is passed as a query parameter, not extracted from JWT. The `decode_token` function exists but is unused in route handlers.
- Messages use soft-delete (`is_deleted` flag) — content is nulled but the row remains.
- The project language is primarily Russian (comments, error messages, UI text).
