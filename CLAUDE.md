# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fullstack monorepo with Next.js frontend and NestJS backend. Uses npm workspaces + Turborepo for unified dependency management.

```
├── frontend/           # Next.js 15 (App Router) + TanStack Query + Jest — port 3001
├── backend/            # NestJS 11 + nodemon — port 3000
├── shared/             # Shared TypeScript types (@repo/shared)
├── .claude/commands/   # Custom slash commands
├── documents/          # Work tracking (organized by ticket)
├── turbo.json          # Turborepo configuration
└── package.json        # npm workspaces root
```

## Commands

```bash
npm install              # Install all dependencies
npm run dev              # Start FE (:3001) + BE (:3000) in parallel
npm run build            # Build all workspaces
npm run test             # Run all tests
npm run lint             # Lint all code
```

**Backend tests:**
```bash
cd backend && npm run test          # Jest unit tests
cd backend && npm run test:watch    # Watch mode
cd backend && npm run test:cov      # Coverage report
cd backend && npm run test:e2e      # E2E tests
```

**Run a single test file:**
```bash
cd frontend && npx jest src/path/to/file.spec.ts
cd backend  && npx jest src/path/to/file.spec.ts
```

## Architecture

### Request Flow

Frontend home page → `useHealth()` (TanStack Query) → fetches `${NEXT_PUBLIC_API_URL}/api/health` → NestJS controller returns `HealthResponse` (shared type).

- **API client**: `frontend/src/utils/fetchers/fetchers.client.ts` constructs URLs from `NEXT_PUBLIC_API_URL` (default: `http://localhost:3000`)
- **TanStack Query provider**: `frontend/src/app/providers.tsx` — wraps app, passes default fetch function
- **Query hooks**: `frontend/src/queries/` — use shared types for response typing

### Shared Types

`shared/src/types/` exports interfaces used by both frontend and backend:
- `HealthResponse` — `{ status: 'ok' | 'error', timestamp: string }`
- `ApiResponse<T>` — generic wrapper

Import as: `import { HealthResponse } from '@repo/shared'`

### Backend Structure

- `src/main.ts` — bootstraps NestJS, enables CORS (`origin: true, credentials: true`), mounts Swagger UI at `/` and JSON at `/api-json`
- `src/app.module.ts` — root module, loads global `ConfigModule` (reads `.env`)
- DTOs in `src/dto/` implement shared interfaces and add Swagger decorators

### Environment Variables

Copy `.env.example` to `.env` in each workspace before running:
- `backend/.env` — `NODE_ENV`, `PORT` (default 3000)
- `frontend/.env.local` — `NEXT_PUBLIC_API_URL` (default `http://localhost:3000`)

## Code Style

- **Prettier**: semi, 2-space tabs, 100 print width, single quotes, trailing commas
- **ESLint**: unified root `.eslintrc.js` — TypeScript, Next.js, Prettier; all packages at root
- **TypeScript**: strict mode; frontend uses `moduleResolution: bundler`; backend uses CommonJS + decorators; shared uses CommonJS

## Documentation Pattern

Work is tracked in `documents/[TICKET-NUMBER]/`:
```
documents/FEAT-1/
├── plans/        # PRDs, RFCs, design decisions
└── development/  # Implementation docs
```

## Custom Slash Commands

Located in `.claude/commands/[skill-name]/SKILL.md`. Replace `[TICKET]` with ticket ID (e.g., `FEAT-1`).

| Command | Description |
|---------|-------------|
| `/write-a-prd [TICKET]` | Create a PRD through systematic discovery |
| `/grill-me [TICKET]` | Stress-test a plan through questioning |
| `/tdd [TICKET]` | Implement features with test-driven development |
| `/triage-issue [TICKET]` | Investigate bugs and create fix plans |
| `/improve-codebase-architecture [TICKET]` | Find architectural improvements |
| `/deploy-vercel [TICKET]` | Deploy to Vercel with step-by-step guidance |

## Deployment (Vercel)

- **Frontend**: set root directory `frontend`, auto-detected as Next.js
- **Backend**: set root directory `backend`, runs as serverless function via `backend/api/index.ts`
- Backend serverless limitations: cold starts, no WebSockets, 10s timeout
