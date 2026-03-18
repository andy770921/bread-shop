# Development: Initialize Fullstack Monorepo Project

## Implementation Steps

### Phase 1: Root Setup (Updated with Turborepo)

1. **Create root package.json with npm workspaces + Turborepo**
   ```json
   {
     "workspaces": ["frontend", "backend"],
     "scripts": {
       "dev": "turbo run dev",
       "build": "turbo run build",
       "test": "turbo run test",
       "lint": "turbo run lint"
     },
     "devDependencies": {
       "turbo": "^2.4.0",
       "prettier": "^3.5.0"
     }
   }
   ```

2. **Create turbo.json**
   - Configure tasks: dev, build, test, lint
   - Enable caching for build outputs

3. **Create shared ESLint config (.eslintrc.js)**
   - Base rules: eslint:recommended, prettier
   - Plugin: prettier

4. **Create shared Prettier config (.prettierrc)**

5. **Create .gitignore**
   - Include `.turbo` for Turborepo cache

### Phase 2: Frontend Setup

1. **Create frontend/package.json**
   - Dependencies: react@^18.3, react-dom@^18.3
   - DevDependencies: vite, vitest, typescript, testing-library

2. **Create vite.config.ts** with Vitest

3. **Create tsconfig.json** for React

4. **Create .eslintrc.cjs** extending react-app

5. **Create source files**
   - index.html, src/main.tsx, src/App.tsx, src/App.test.tsx

6. **Create frontend/vercel.json for deployment**
   ```json
   {
     "framework": "vite",
     "buildCommand": "npm run build",
     "outputDirectory": "dist"
   }
   ```

### Phase 3: Backend Setup

1. **Create backend/package.json**
   - Dependencies: @nestjs/core, @nestjs/common, @nestjs/config
   - DevDependencies: typescript, jest, nodemon, ts-node

2. **Create tsconfig.json** with decorators enabled

3. **Create nodemon.json** for hot-reload

4. **Create .eslintrc.js** extending @typescript-eslint

5. **Create source files**
   - src/main.ts, src/app.module.ts, src/app.controller.ts

6. **Create Vercel serverless configuration**
   - `backend/api/index.ts` - Serverless handler
   - `backend/vercel.json` - Routes configuration

### Phase 4: Claude Code Skills

1. **Create .claude/commands/** with 6 skills using `folder-name/SKILL.md` structure:
   - `write-a-prd/SKILL.md`
   - `grill-me/SKILL.md`
   - `tdd/SKILL.md`
   - `triage-issue/SKILL.md`
   - `improve-codebase-architecture/SKILL.md`
   - `deploy-vercel/SKILL.md` (NEW - step-by-step Vercel deployment guide)
2. **Modify to use documents/ instead of GitHub issues**

### Phase 5: Documentation

1. **Create CLAUDE.md**
2. **Create documents/FEAT-1/** structure

### Phase 6: Vercel Deployment Configuration

#### Frontend (vercel.json)
```json
{
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "installCommand": "npm install"
}
```

#### Backend (vercel.json + api/index.ts)
```json
{
  "version": 2,
  "builds": [{ "src": "api/index.ts", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "api/index.ts" }]
}
```

#### Serverless Handler (api/index.ts)
```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';

let app;
async function bootstrap() {
  if (!app) {
    app = await NestFactory.create(AppModule);
    app.enableCors({ origin: true, credentials: true });
    await app.init();
  }
  return app;
}

export default async function handler(req, res) {
  const app = await bootstrap();
  const expressApp = app.getHttpAdapter().getInstance();
  return expressApp(req, res);
}
```

## Verification Steps

```bash
# 1. Install all dependencies (single command!)
npm install

# 2. Start development (both FE and BE)
npm run dev
# Frontend: http://localhost:5173
# Backend: http://localhost:3000

# 3. Run all tests
npm run test

# 4. Build all
npm run build
```

## Vercel Deployment Steps

### Deploy Frontend
1. Go to [vercel.com](https://vercel.com)
2. Import repository
3. Set root directory to `frontend`
4. Deploy (auto-detects Vite)

### Deploy Backend
1. Go to [vercel.com](https://vercel.com)
2. Import same repository (as new project)
3. Set root directory to `backend`
4. Deploy (uses vercel.json config)

### Environment Variables
Set in Vercel Project Settings:
- `NODE_ENV=production`
- `PORT=3000` (optional, Vercel manages this)
- Any other secrets needed

## Files Created

### Root (6 files)
- [x] package.json (with workspaces)
- [x] turbo.json
- [x] .eslintrc.js
- [x] .prettierrc
- [x] .gitignore
- [x] CLAUDE.md

### Frontend (12 files)
- [x] package.json
- [x] vite.config.ts
- [x] tsconfig.json
- [x] tsconfig.node.json
- [x] .eslintrc.cjs
- [x] vercel.json
- [x] index.html
- [x] src/main.tsx
- [x] src/App.tsx
- [x] src/App.css
- [x] src/setupTests.ts
- [x] src/App.test.tsx

### Backend (14 files)
- [x] package.json
- [x] tsconfig.json
- [x] tsconfig.build.json
- [x] .eslintrc.js
- [x] nodemon.json
- [x] nest-cli.json
- [x] vercel.json
- [x] .env.example
- [x] api/index.ts
- [x] src/main.ts
- [x] src/app.module.ts
- [x] src/app.controller.ts
- [x] src/app.service.ts
- [x] src/app.controller.spec.ts

### Claude Commands (6 skills, folder/SKILL.md structure)
- [x] .claude/commands/write-a-prd/SKILL.md
- [x] .claude/commands/grill-me/SKILL.md
- [x] .claude/commands/tdd/SKILL.md
- [x] .claude/commands/triage-issue/SKILL.md
- [x] .claude/commands/improve-codebase-architecture/SKILL.md
- [x] .claude/commands/deploy-vercel/SKILL.md (NEW)

### Documentation (2 files)
- [x] documents/FEAT-1/plans/init-fullstack-project.md
- [x] documents/FEAT-1/development/init-fullstack-project.md

## Status

- [x] Phase 1: Root Setup (Turborepo)
- [x] Phase 2: Frontend Setup
- [x] Phase 3: Backend Setup
- [x] Phase 4: Claude Code Skills
- [x] Phase 5: Documentation
- [x] Phase 6: Vercel Deployment Config
- [ ] Verification (run `npm install` then `npm run dev`)

## References

- [Vercel NestJS Documentation](https://vercel.com/docs/frameworks/backend/nestjs)
- [Turborepo Documentation](https://turborepo.dev/docs)
- [Lessons Learned: Hosting NestJS on Vercel](https://nerd-corner.com/lessons-learned-hosting-nestjs-app-on-vercel/)
