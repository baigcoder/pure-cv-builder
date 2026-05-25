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
web/
  frontend/
    src/app/              App routes: landing, upload, editor
    src/components/       Shared brand, cards, banners, client wrappers
    src/hooks/            Draft autosave and live preview hooks
    src/lib/              CV data model, API client, theme metadata
  backend/
    api/render.py         Render, preview, YAML, upload, AI, cover-letter routes
    services/             RenderCV, PDF extraction, AI, cover-letter services
    tests/                API and service regression tests
```

## Main User Flows

### 1. Blank CV to PDF

```text
/editor -> edit CV sections -> /api/preview -> RenderCV output -> PDF download
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

AI features still provide local fallbacks where possible when no provider key is configured.

## Local Development

### Backend

```powershell
cd web/backend
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
cd web/frontend
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
.\web\backend\.venv\Scripts\python.exe -m pytest -o addopts='' web/backend/tests
```

Run frontend checks:

```powershell
cd web/frontend
npm run lint
npm run build
```

Recommended smoke checks:

- `GET http://127.0.0.1:8000/health`
- `POST http://127.0.0.1:8000/api/preview`
- `POST http://127.0.0.1:8000/api/ai/enhance-cv`
- Browser checks for `/`, `/upload`, `/editor`, and `/editor?section=cover_letter`

## Development Rules

- Keep RenderCV core logic and ApplyForge web UX concerns separate.
- Do not hardcode secrets, provider keys, or private URLs.
- Preserve route compatibility: `/`, `/upload`, `/editor`, `/editor?section=cover_letter`.
- Keep UI responsive on desktop and mobile before merging.
- Add or update regression tests when changing parser, render, AI, ATS, or cover-letter behavior.
