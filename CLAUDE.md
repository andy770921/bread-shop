# Claude Code Instructions

## Project Overview

This is a fullstack monorepo with React (Vite) frontend and NestJS backend, designed for seamless Claude Code integration. Uses npm workspaces + Turborepo for unified dependency management.

## Structure

```
├── frontend/           # React + Vite + Vitest
├── backend/            # NestJS + nodemon
├── .claude/commands/   # Custom slash commands
├── documents/          # Work tracking (organized by ticket)
├── turbo.json          # Turborepo configuration
└── package.json        # npm workspaces root
```

## Quick Start

```bash
# Install all dependencies (single command!)
npm install

# Start development (FE on :5173, BE on :3000)
npm run dev

# Run all tests
npm run test

# Build all
npm run build

# Lint all code
npm run lint
```

## Deployment (Vercel)

Both frontend and backend are configured for Vercel deployment.

### Frontend
- Auto-detected as Vite project
- Set root directory: `frontend`
- Config: `frontend/vercel.json`

### Backend (Serverless)
- Runs as Vercel serverless function
- Set root directory: `backend`
- Config: `backend/vercel.json` + `backend/api/index.ts`

**Note**: Backend has serverless limitations (cold starts, no WebSockets, 10s timeout).

## Custom Slash Commands (Skills)

Skills are located in `.claude/commands/[skill-name]/SKILL.md`

| Command | Description |
|---------|-------------|
| `/write-a-prd [TICKET]` | Create a PRD through systematic discovery |
| `/grill-me [TICKET]` | Stress-test a plan through questioning |
| `/tdd [TICKET]` | Implement features with test-driven development |
| `/triage-issue [TICKET]` | Investigate bugs and create fix plans |
| `/improve-codebase-architecture [TICKET]` | Find architectural improvements |
| `/deploy-vercel [TICKET]` | Deploy to Vercel with step-by-step guidance |

**Usage**: Replace `[TICKET]` with your ticket identifier (e.g., `FEAT-1`, `BUG-42`).

## Documentation Pattern

All work should be tracked in `documents/[TICKET-NUMBER]/`:

```
documents/
└── FEAT-1/
    ├── plans/              # PRDs, RFCs, design decisions
    └── development/        # Implementation docs
```

## Code Style

### Prettier
- Semi: true | Tab width: 2 | Print width: 100
- Single quotes | Trailing commas: all | Bracket spacing: true

### ESLint
- Frontend: react-app + prettier
- Backend: @typescript-eslint + prettier

### TypeScript
- Strict mode enabled
- Frontend: ES2020, React JSX
- Backend: ES2021, CommonJS, decorators

## Testing

```bash
# Run all tests
npm run test

# Individual apps
cd frontend && npm run test
cd backend && npm run test
```

## Development Notes

- Frontend: http://localhost:5173
- Backend: http://localhost:3000
- Uses Turborepo for parallel task execution
- Caching enabled for builds
