# Bread Shop

A fullstack monorepo with Next.js frontend and NestJS backend, optimized for Claude Code integration.

## Features

- **Frontend**: Next.js 15 (App Router) + TypeScript + TanStack Query v5 + Jest
- **Backend**: NestJS 11 + TypeScript + Jest
- **Shared**: `@repo/shared` — TypeScript types shared between FE and BE
- **Tooling**: ESLint + Prettier + Turborepo
- **Claude Code**: 6 custom slash commands for structured development

## Quick Start

```bash
# Install all dependencies
npm install

# Start development servers
npm run dev
# Frontend: http://localhost:3001
# Backend:  http://localhost:3000

# Run tests
npm run test

# Lint code
npm run lint
```

## Project Structure

```
├── frontend/             # Next.js App Router application
├── backend/              # NestJS application
├── shared/               # Shared TypeScript types (@repo/shared)
├── .claude/commands/     # Claude Code slash commands
├── documents/            # Work tracking by ticket
├── CLAUDE.md             # Claude Code instructions
└── package.json          # Root workspaces + scripts
```

## API Integration

The frontend calls the backend via a typed API client (`frontend/src/lib/api-client.ts`):

- All types come from `@repo/shared` — one source of truth for FE + BE
- Next.js rewrites `/api/*` → `http://localhost:3000/*` in dev (no CORS needed)
- TanStack Query hooks (`frontend/src/queries/`) handle caching, loading, and error states
- Components only call hooks — they never touch `fetch` directly

## Claude Code Commands

| Command                                   | Description                                 |
| ----------------------------------------- | ------------------------------------------- |
| `/write-a-prd [TICKET]`                   | Create a PRD through systematic discovery   |
| `/grill-me [TICKET]`                      | Stress-test a plan through questioning      |
| `/tdd [TICKET]`                           | Implement with test-driven development      |
| `/triage-issue [TICKET]`                  | Investigate bugs and create fix plans       |
| `/improve-codebase-architecture [TICKET]` | Find architectural improvements             |
| `/deploy-vercel [TICKET]`                 | Deploy to Vercel with step-by-step guidance |

## Production

| App      | URL                                                 |
| -------- | --------------------------------------------------- |
| Frontend | https://claude-code-boilerplate-frontend.vercel.app |
| Backend  | https://claude-code-boilerplate-backend.vercel.app  |

## Documentation

See [CLAUDE.md](CLAUDE.md) for detailed project instructions.

Work progress is tracked in [documents/](documents/) folder organized by ticket number.

## Ref

- https://github.com/mattpocock/skills/tree/main

## License

MIT
