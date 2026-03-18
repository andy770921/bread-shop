# Plan: Initialize Fullstack Monorepo Project

## Objective

Create a fullstack project with React (Vite) frontend and NestJS backend in a single repository, enabling Claude Code to have full context of both FE and BE code.

## Key Decisions

### 1. Architecture: npm Workspaces + Turborepo

**Updated Decision:** Use npm workspaces with Turborepo for unified dependency management.

**Rationale:**
- Single `npm install` at root installs all dependencies
- Turborepo provides task orchestration and caching
- Clean scripts: `npm run dev`, `npm run build`, `npm run test`
- Better monorepo experience while keeping simplicity

**Configuration:**
- `package.json` with `"workspaces": ["frontend", "backend"]`
- `turbo.json` for task configuration

### 2. Frontend Stack

- **Framework**: React 18.3 with TypeScript
- **Build Tool**: Vite 6.2
- **Testing**: Vitest 3.0 + React Testing Library
- **Linting**: ESLint with react-app config
- **Deployment**: Vercel (native Vite support)

### 3. Backend Stack

- **Framework**: NestJS 11
- **Environment**: @nestjs/config (dotenv built-in)
- **Dev Server**: nodemon with ts-node
- **Testing**: Jest 29 with ts-jest
- **Deployment**: Vercel Serverless Functions

### 4. Shared Configuration

- Root `.prettierrc` inherited by both apps
- Root `.eslintrc.js` as base config
- Apps extend with specific rules

### 5. Claude Code Skills Migration

Migrated 5 skills from mattpocock/skills:
- write-a-prd
- grill-me
- tdd
- triage-issue
- improve-codebase-architecture

**Key Modification**: Replaced GitHub issue creation with document-based tracking in `documents/` folder.

### 6. Deployment Strategy: Vercel for Both FE and BE

#### Frontend Deployment (Vercel)
- **Status**: Fully supported out of the box
- **Configuration**: `frontend/vercel.json`
- Vercel auto-detects Vite framework
- Zero configuration required

#### Backend Deployment (Vercel Serverless)
- **Status**: Supported with configuration
- **Configuration**: `backend/vercel.json` + `backend/api/index.ts`

**How it works:**
- NestJS app runs as serverless function via `@vercel/node`
- Each request bootstraps NestJS app (with caching for warm starts)
- Routes handled by `api/index.ts` handler

**Limitations to consider:**
| Limitation | Impact |
|------------|--------|
| Cold starts | First request may be slower (~1-2s) |
| Execution timeout | 10s default, 60s max on Pro plan |
| No WebSockets | Use polling or external service |
| No persistent connections | No long-lived DB connections |
| Stateless | Use Redis/DB for session storage |

**Best for:**
- Small to medium APIs
- Serverless-friendly workloads
- Cost-effective low-traffic APIs

**Consider alternatives (AWS/GCP/Railway) for:**
- High-traffic APIs needing persistent connections
- WebSocket requirements
- Long-running processes

## Project Structure

```
claude-code-fullstack-boilerplate/
├── .claude/commands/        # 5 Claude Code slash commands
├── documents/               # Work tracking by ticket
├── frontend/                # React + Vite + Vitest
│   └── vercel.json          # Vercel deployment config
├── backend/                 # NestJS + nodemon + Jest
│   ├── api/index.ts         # Vercel serverless handler
│   └── vercel.json          # Vercel deployment config
├── .eslintrc.js             # Shared base config
├── .prettierrc              # Shared formatting
├── turbo.json               # Turborepo configuration
├── package.json             # npm workspaces + turbo scripts
└── CLAUDE.md                # Project instructions
```

## Status

- [x] Planning complete
- [x] Implementation complete
- [x] Turborepo integration
- [x] Vercel deployment configuration
- [ ] Verification (run `npm install` then `npm run dev`)
