# Fix: `@repo/shared` Module Resolution on Vercel

## Problem

All backend API endpoints (`/api/categories`, `/api/products`, `/api/cart`, etc.) return **500 Internal Server Error** on the Vercel production deployment (`papa-bread.vercel.app`), causing the frontend to show:

> Application error: a client-side exception has occurred while loading papa-bread.vercel.app

## 2026-04-14 Correction

The analysis below stopped one step too early. Even after switching runtime code to `dist/index.js`, `shared/package.json` still advertised TypeScript source through:

```json
{
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts"
    }
  }
}
```

`tsc --traceResolution` confirms both `backend` and `frontend` resolve `@repo/shared` to `shared/src/index.ts` via the `types` export condition. That matches the Vercel error path exactly.

The corrected deploy-safe shape for a compiled internal package is:

```json
{
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  }
}
```

Because `shared/tsconfig.json` already emits declaration files plus `declarationMap`, editor go-to-definition still works, but Vercel no longer has any package metadata that points at raw `.ts` source.

## Timeline of Errors and Fixes

| # | Error | Root Cause | Fix |
|---|-------|-----------|-----|
| 1 | `Cannot find module '.../src/index.ts'` | `main` pointed to `.ts`; Node.js can't execute `.ts` | Changed `main` to `./dist/index.js`, added `exports` with `types` condition |
| 2 | `Cannot find module '@repo/shared'` | `exports`-only package.json; `@vercel/node` ncc didn't support `exports` | Added `main` as legacy fallback alongside `exports` |
| 3 | `Cannot find module '.../dist/index.js'` | `buildCommand` ignored when legacy `builds` array is present | Merged shared build into `installCommand` |
| 4 | `Cannot find module '.../dist/index.js'` (persisted) | ncc (legacy `builds`) excludes symlinks pointing outside `rootDirectory` | Switched to modern `functions` API + direct `.ts` source exports |

## Root Cause Analysis

### Why It Worked Locally

NestJS dev mode uses `ts-node`/`nodemon`, which transpile `.ts` on the fly. `npm install` runs from the monorepo root, creating workspace symlinks. Turborepo's `dependsOn: ["^build"]` ensures dependencies build first.

### Why It Failed on Vercel (the real issue)

The backend Vercel project has `rootDirectory: backend/`. The `@vercel/node` builder (used in the legacy `builds` array) uses **@vercel/nft** (Node File Trace) to trace dependencies. nft contains a **symlink boundary check** that explicitly excludes symlinks pointing outside the `rootDirectory`:

```javascript
// @vercel/nft source — symlink filtering logic
const symlinkTarget = relative(baseDir, resolve(dirname(entry.fsPath), readlinkSync(entry.fsPath)));
if (symlinkTarget.startsWith('..' + sep)) {
  // EXCLUDED — target is outside rootDirectory
}
```

The npm workspace symlink at `node_modules/@repo/shared` → `../../shared/` starts with `..`, so nft **excludes the entire package** from the Lambda filesystem. This is why:

- `includeFiles` with `../shared/dist/**` placed files at `/var/task/shared/dist/` (relative path from root), NOT at `/var/task/node_modules/@repo/shared/dist/` (where `require()` looks)
- Pre-compiling `shared/dist/` via `installCommand` had no effect — nft still excluded the symlink target
- The `package.json` was sometimes found (copied by nft's package resolution) but `dist/` never was

## Final Solution: Modern `functions` API + Direct `.ts` Source

Instead of fighting the legacy `builds` API, switched to Vercel's modern `functions` property and pointed `@repo/shared` directly at TypeScript source (no pre-compilation needed).

### Why Direct `.ts` Works on Vercel

1. **nft traces `.ts` files** — with `ts: true`, nft resolves TypeScript extensions during module resolution
2. **esbuild compiles them** — all traced `.ts` files are transpiled to JavaScript during the build phase
3. **`includeFiles` in `functions` is a safety net** — explicitly includes `../shared/src/**` even if nft's symlink boundary check would exclude them
4. **`functions` replaces `builds`** — the modern API (they cannot coexist) properly handles `includeFiles` path mapping

### Files Changed

#### 1. `shared/package.json`

**Before (original):**

```json
{
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": { "build": "tsc --noEmit" }
}
```

**After (final):**

```json
{
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  }
}
```

All fields point to `.ts` source. `@vercel/node`'s esbuild handles TypeScript compilation. The `build` script still emits `dist/` for any non-Vercel environment that needs compiled JS (e.g., plain Node.js), but Vercel doesn't need it.

#### 2. `backend/vercel.json`

**Before (original):**

```json
{
  "version": 2,
  "builds": [
    { "src": "api/index.ts", "use": "@vercel/node" }
  ],
  "routes": [
    { "src": "/(.*)", "dest": "api/index.ts", "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] }
  ]
}
```

**After (final):**

```json
{
  "version": 2,
  "installCommand": "cd .. && npm install",
  "functions": {
    "api/index.ts": {
      "includeFiles": "../shared/src/**"
    }
  },
  "rewrites": [
    { "source": "/(.*)", "destination": "/api/index.ts" }
  ]
}
```

Key changes:

| Change | Why |
|--------|-----|
| `builds` → `functions` | Modern API; nft + esbuild properly traces and compiles `.ts` files. Legacy `builds` used ncc which excluded workspace symlinks outside `rootDirectory`. |
| `routes` → `rewrites` | `routes` is legacy (pairs with `builds`). `rewrites` is the modern equivalent. |
| `installCommand: "cd .. && npm install"` | Runs install from monorepo root to create workspace symlinks (`node_modules/@repo/shared` → `../../shared/`). |
| `includeFiles: "../shared/src/**"` | Safety net: ensures shared `.ts` source is included in the Lambda even if nft's symlink boundary check excludes it. |

#### 3. `shared/tsconfig.json`

- Added `"declarationMap": true` — enables "Go to Definition" to jump to `.ts` source instead of `.d.ts`
- Added `"exclude": ["node_modules", "dist"]`

#### 4. `shared/.gitignore` (new file)

```
dist/
```

#### 5. `frontend/tsconfig.json`

Removed the manual path alias for `@repo/shared`:

```diff
  "paths": {
    "@/*": ["./src/*"],
-   "@repo/shared": ["../shared/src/index.ts"]
  }
```

No longer needed — TypeScript with `moduleResolution: "bundler"` resolves the `"types"` condition in `exports` automatically.

### Vercel Dashboard Prerequisite

Ensure the backend Vercel project has **"Include source files outside of the Root Directory in the Build Step"** enabled (Settings → General → Root Directory). This is on by default for projects created after August 2020, but verify it. Without this, Vercel cannot access `../shared/` during the build.

## Failed Approaches (for reference)

### Approach 1: Compiled Package with `dist/` (Fix 1–3)

Pointed `main`/`exports.default` to `./dist/index.js` and pre-compiled with `tsc`. Failed because the legacy `builds` API's nft excludes workspace symlinks pointing outside `rootDirectory`, so `dist/index.js` was never included in the Lambda regardless of whether it was compiled.

### Approach 2: `includeFiles` with `../shared/dist/**`

Tried including compiled output via `includeFiles` in the `builds` config. Failed because files were placed at their relative path (`/var/task/shared/dist/`), not at the symlink's resolved location (`/var/task/node_modules/@repo/shared/dist/`).

### Approach 3: `buildCommand` for shared compilation

Added `"buildCommand": "cd ../shared && npm run build"`. Failed because `buildCommand` is a project-level setting that is ignored when the legacy `builds` array is present.

## References

- [@vercel/nft source — symlink boundary check](https://github.com/vercel/nft) — nft excludes symlinks outside rootDirectory
- [ncc monorepo symlink asset relocation bug (vercel/ncc#951)](https://github.com/vercel/ncc/issues/951) — known issue with workspace symlinks
- [Vercel: vercel.json — builds vs functions](https://vercel.com/docs/project-configuration) — `builds` (legacy) vs `functions` (modern)
- [Vercel: Monorepos](https://vercel.com/docs/monorepos) — `installCommand` and monorepo workspace setup
- [Vercel: Node.js Runtime](https://vercel.com/docs/functions/runtimes/node-js) — esbuild TypeScript compilation
- [Turborepo: Creating an Internal Package](https://turborepo.dev/docs/crafting-your-repository/creating-an-internal-package) — Compiled vs Just-in-Time patterns
- [TypeScript: Package.json Exports](https://www.typescriptlang.org/docs/handbook/modules/reference.html#packagejson-exports) — conditional exports with `types` condition
