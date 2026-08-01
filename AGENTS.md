# AGENTS.md

Guidance for AI agents and cloud development environments working on LiveTranslator.

## Project overview

LiveTranslator is a React + Vite frontend with an Express API backend for real-time text translation.

| Path | Purpose |
|------|---------|
| `src/` | React UI (live debounced translation) |
| `server/` | Express API (`/api/translate`, `/api/health`) |
| `dist/` | Production build output (frontend assets + compiled server) |

## Prerequisites

- Node.js 20+ (Node 22 in Cursor Cloud)

## Common commands

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run dev` | Vite on **5173** + API on **3001** (via `concurrently`) |
| `npm run lint` | ESLint |
| `npm run test` | Vitest |
| `npm run build` | Compile server TS + Vite production build |

## Cursor Cloud specific instructions

### Starting dev servers

Run `npm run dev` from the repo root. Use a tmux-backed session for long-running processes:

```bash
SESSION_NAME="live-translator-dev"
tmux -f /exec-daemon/tmux.portal.conf has-session -t "=$SESSION_NAME" 2>/dev/null || \
  tmux -f /exec-daemon/tmux.portal.conf new-session -d -s "$SESSION_NAME" -c "$PWD" -- "${SHELL:-zsh}" -l
tmux -f /exec-daemon/tmux.portal.conf send-keys -t "$SESSION_NAME:0.0" 'npm run dev' C-m
```

Open **http://localhost:5173**. The Vite dev server proxies `/api` to the backend on port 3001.

### Translation API behavior

- Default: uses `google-translate-api-x` (no API key; public Google Translate endpoints).
- External translation can return rate-limit errors in shared cloud environments.
- The server automatically falls back to offline mock translations on failure.
- Set `USE_MOCK_TRANSLATOR=true` to force mock mode for reliable local demos.

### Quick API smoke test

```bash
curl -s http://localhost:3001/api/health
curl -s -X POST http://localhost:3001/api/translate \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello, world!","to":"es"}'
```

Expected Spanish translation: `¡Hola, mundo!` (via live API or mock fallback).

### Lint / test / build

All run from repo root with no extra services (no database or Docker required).
