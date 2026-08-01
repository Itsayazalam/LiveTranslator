# Live AI Interpreter

**MVP ready** — Real-time Australian English ↔ Hindi interpreter powered by OpenAI Realtime Translation API.

## How it works

1. **Start** the session and speak — the Original panel streams your speech as text.
2. **Press Space** — runs a full-sentence translation (no word-by-word preview).
3. **Release Space** — saves the turn to history and flips direction (EN → HI ↔ HI → EN).

Translation uses batch GPT (`/api/translate`) for natural Hindi/English; WebRTC is used for live speech-to-text only.

## Architecture

```
Browser (React + WebRTC)
    │  direct audio stream
    ▼
OpenAI Realtime Translation API
    ▲
    │  ephemeral token
Browser ──POST /api/session──▶ Hono Server (Node.js)
```

Monorepo layout:

- `apps/web` — React frontend with WebRTC client
- `apps/server` — Hono session bootstrap server
- `packages/core` — Translation session engine (state machine, turn buffer, latency)
- `packages/shared` — Shared TypeScript types

## Prerequisites

- Node.js 22+
- pnpm 9+
- OpenAI API key with Realtime Translation access

## Setup

```bash
cp .env.example .env
# Add your OPENAI_API_KEY to .env

pnpm install
pnpm dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001

## Phase 0 Validation Spike

Verify Hindi ↔ English session creation before running the full app:

```bash
OPENAI_API_KEY=sk-... pnpm spike
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start web + server in dev mode |
| `pnpm build` | Build all packages |
| `pnpm test` | Run unit tests |
| `pnpm spike` | Validate OpenAI API language support |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Space` (press) | Translate current segment |
| `Space` (release) | Finish segment and flip direction |
| `Cmd+L` | Swap languages |
| `Cmd+Shift+C` | Copy translation |

## Docker

```bash
OPENAI_API_KEY=sk-... docker compose up --build
```

## Deployment

| Component | Suggested target |
|-----------|-----------------|
| Frontend | Vercel / Cloudflare Pages |
| Backend | Fly.io / Railway |

Set `CORS_ORIGIN` to your frontend URL in production.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key (server only) | required |
| `PORT` | Server port | `3001` |
| `CORS_ORIGIN` | Allowed frontend origin | `http://localhost:5173` |
