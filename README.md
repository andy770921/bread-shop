# Claude Code Fullstack Boilerplate

A fullstack monorepo with React (Vite) frontend and NestJS backend, optimized for Claude Code integration.

## Features

- **Frontend**: React 18 + TypeScript + Vite + Vitest
- **Backend**: NestJS 11 + TypeScript + Jest
- **Shared**: ESLint + Prettier configuration
- **Claude Code**: 5 custom slash commands for structured development

## Quick Start

```bash
# Install all dependencies
npm run install:all

# Start development servers
npm run dev
# Frontend: http://localhost:5173
# Backend: http://localhost:3000

# Run tests
npm run test

# Lint code
npm run lint
```

## Project Structure

```
- frontend/               # React + Vite application
- backend/                # NestJS application
- .claude/commands/       # Claude Code slash commands
- documents/              # Work tracking by ticket
- CLAUDE.md               # Claude Code instructions
- package.json            # Root convenience scripts
```

## Claude Code Commands

| Command                                   | Description                               |
| ----------------------------------------- | ----------------------------------------- |
| `/write-a-prd [TICKET]`                   | Create a PRD through systematic discovery |
| `/grill-me [TICKET]`                      | Stress-test a plan through questioning    |
| `/tdd [TICKET]`                           | Implement with test-driven development    |
| `/triage-issue [TICKET]`                  | Investigate bugs and create fix plans     |
| `/improve-codebase-architecture [TICKET]` | Find architectural improvements           |

## Documentation

See [CLAUDE.md](CLAUDE.md) for detailed project instructions.

Work progress is tracked in [documents/](documents/) folder organized by ticket number.

## License

MIT
