# LiveTranslator

Real-time text translation web app with a React frontend and Express API backend.

## Prerequisites

- Node.js 20+ (Node 22 is used in cloud dev environments)

## Setup

```bash
npm install
```

## Development

Start the Vite dev server (port 5173) and API server (port 3001) together:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Type in the source text field; translations update automatically (debounced).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run frontend + API in watch mode |
| `npm run build` | Compile server TypeScript and build frontend |
| `npm run preview` | Preview production frontend build |
| `npm run lint` | ESLint |
| `npm run test` | Vitest unit tests |

## Architecture

- **Frontend** (`src/`): React + Vite, proxies `/api` to the backend during development
- **Backend** (`server/`): Express API with `POST /api/translate` using `google-translate-api-x`

No API keys are required for local development. The translation client uses public Google Translate endpoints.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | API server port |
| `USE_MOCK_TRANSLATOR` | `false` | Use offline mock translations (useful when external APIs are rate-limited) |

When `USE_MOCK_TRANSLATOR` is not set, the API tries `google-translate-api-x` first and falls back to mock translations if the external service fails.
