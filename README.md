# ApplyForge

ApplyForge is an ATS-focused application workspace built on RenderCV. It helps candidates turn a raw resume or blank profile into a polished CV, live PDF preview, ATS-improved content, and a matching cover letter.

The app is split into a Next.js frontend and a FastAPI backend. RenderCV remains the rendering engine; ApplyForge adds the browser workflow, PDF import, AI assistance, and application-packet UX around it.

## What ApplyForge Does

- Import an existing resume PDF and convert detected text into editable CV sections.
- Build a CV in a live editor with profile, skills, work, projects, education, publications, honors, patents, talks, and design controls.
- Preview RenderCV output as the user edits.
- Score the CV for ATS readiness and apply one-click CV enhancement.
- Add project live-demo links so portfolio work appears cleanly in the CV and cover-letter context.
- Generate an editable one-page cover letter from the live CV, location, skills, projects, role, and job context.
- Export CV PDF, YAML, and cover-letter PDF.

## Tech Stack

| Layer | Stack |
| --- | --- |
| Frontend | Next.js, React, TypeScript, CSS Modules |
| Backend | FastAPI, Pydantic, PyMuPDF, OpenAI-compatible AI client |
| Rendering | RenderCV YAML pipeline and PDF/PNG rendering |
| AI | OpenAI-compatible provider with deterministic local fallbacks |

## Project Structure

```text
frontend/
  src/app/              App routes: landing, upload, editor
  src/components/       Shared brand, cards, banners, client wrappers
  src/hooks/            Draft autosave and live preview hooks
  src/lib/              CV data model, API client, theme metadata
  src/lib/api/          Generated OpenAPI schema + TS types, typed fetch helpers
backend/
  main.py               App setup: middleware, CORS, error handlers
  core/                 Settings, shared rate limiter, error contract
  schemas/              Pydantic models: the single source of truth for API shapes
  api/routes/           render, ai, cover_letter, pdf routers
  services/             RenderCV rendering (in-process + cache), PDF extraction, AI, cover letters
  scripts/              export_openapi.py (feeds frontend type generation)
  tests/                API and service regression tests
```

### Shared schema

Backend models in `backend/schemas` generate the frontend's TypeScript types:

```powershell
cd backend; .\.venv\Scripts\python.exe scripts/export_openapi.py
cd ..\frontend; npm run gen:api
```

`tests/test_api_platform.py` fails if the committed `openapi.json` is stale.

### Error contract

Every non-2xx response is `{"detail", "code", "request_id", "fields?"}`. `fields` maps
editor field keys (e.g. `phone`, `experience.0`) to messages. Internal errors never
include renderer output or CV content; look them up in logs by `request_id`.

## Main User Flows

### 1. Blank CV to PDF

```text
/editor -> edit CV sections -> /api/preview/pages (all pages, cached) -> PDF download
```

### 2. PDF Resume Import

```text
/upload -> /api/extract-pdf -> normalized CV data -> local/session handoff -> /editor
```

### 3. ATS Enhancement

```text
live CV data -> /api/ai/enhance-cv -> improved profile, skills, summaries, and project wording
```

### 4. Cover Letter

```text
live CV data + target role/job context -> /api/cover-letter/generate -> editable letter -> PDF export
```

## Compatibility Notes

These storage keys are intentionally kept from the original app so existing drafts and PDF-import handoffs keep working:

- `purecv:draft:v1`
- `purecv:import:v1`

Do not rename those keys unless a migration is added.

## Environment Variables

### Frontend

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | No | Backend base URL. Defaults to `http://localhost:8000`. |

### Backend

| Variable | Required | Description |
| --- | --- | --- |
| `CORS_ORIGINS` | No | Comma-separated list of allowed frontend origins. |
| `LOG_LEVEL` | No | Backend log level. |
| `OPENCODE_API_KEY` | No | Enables OpenAI-compatible AI generation. |
| `OPENCODE_BASE_URL` | No | AI provider base URL. |
| `OPENCODE_MODEL` | No | AI model name. |
| `OPENCODE_TIMEOUT` | No | AI request timeout in seconds. |
| `CORS_ORIGIN_REGEX` | No | Extra allowed origins as a regex. Defaults to Vercel previews. |
| `RATE_LIMIT_ENABLED` | No | `false` disables rate limiting (tests do this). |
| `RATE_LIMIT_PREVIEW` / `_RENDER` / `_AI` / `_DEFAULT` | No | Limits such as `60/minute`. |
| `RENDER_WORKERS` | No | Concurrent renders (default 2). |
| `RENDER_TIMEOUT_SECONDS` | No | Per-render timeout (default 60). |
| `RENDER_CACHE_SIZE` | No | Cached render results (default 64, 0 disables). |
| `PREVIEW_MAX_PAGES` | No | Pages returned by `/api/preview/pages` (default 4). |

AI features still provide local fallbacks where possible when no provider key is configured.

## Local Development

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

## Verification

Run backend tests:

```powershell
.\backend\.venv\Scripts\python.exe -m pytest -o addopts='' backend/tests
```

Run frontend checks:

```powershell
cd frontend
npm run lint
npm run build
```

Recommended smoke checks:

- `GET http://127.0.0.1:8000/health`
- `POST http://127.0.0.1:8000/api/preview/pages`
- `POST http://127.0.0.1:8000/api/ai/enhance-cv`
- Browser checks for `/`, `/upload`, `/editor`, and `/editor?section=cover_letter`

## Development Rules

- Keep RenderCV core logic and ApplyForge web UX concerns separate.
- Do not hardcode secrets, provider keys, or private URLs.
- Preserve route compatibility: `/`, `/upload`, `/editor`, `/editor?section=cover_letter`.
- Keep UI responsive on desktop and mobile before merging.
- Add or update regression tests when changing parser, render, AI, ATS, or cover-letter behavior.
