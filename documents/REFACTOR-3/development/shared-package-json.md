# Fix: `@repo/shared` Resolution on Vercel

## Problem

After commit `4180f23df5fa5876fb1bbe68bf6f23c49d33dbf3`, the backend started using `@repo/shared` at runtime for API requests such as `GET /api/products`. The Vercel deployment failed with:

```text
/var/task/shared/src/index.ts:1
export * from './constants/cart';
^^^^^^

SyntaxError: Unexpected token 'export'
```

This showed that the deployed function was still trying to load raw TypeScript source from `shared/src/index.ts` instead of compiled JavaScript.

## Final Root Cause

Two separate issues were involved:

1. The original deployment path used legacy Vercel `builds`, which is fragile for monorepo workspace symlinks that point outside the backend root directory.
2. Even after moving runtime code to `dist/index.js`, `shared/package.json` still exposed TypeScript source through `types` and `exports.types`, so TypeScript resolution in both `backend` and `frontend` continued to resolve `@repo/shared` to `shared/src/index.ts`.

The second issue is the one that matched the production error exactly.

Local verification with `tsc --traceResolution` showed:

- Before the fix: `@repo/shared` resolved to `shared/src/index.ts`
- After the fix: `@repo/shared` resolved to `shared/dist/index.d.ts`

That change removes all package metadata paths that point to raw `.ts` source in production.

## Final Working Approach

The deploy-safe solution is to treat `shared` as a compiled internal package:

- Runtime entrypoint points to compiled JavaScript in `dist/`
- Type entrypoint points to generated declaration files in `dist/`
- Vercel uses the modern `functions` API instead of legacy `builds`
- `shared` is compiled during the Vercel install step
- `includeFiles` uses a single string glob, which matches the current Vercel schema

## Current Required Configuration

### `shared/package.json`

```json
{
  "name": "@repo/shared",
  "version": "1.0.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "lint": "eslint src"
  }
}
```

Why this matters:

- `main` must point to executable JavaScript
- `types` must point to `.d.ts`, not `.ts`
- `exports.types` must also point to `.d.ts`, or TypeScript tooling will still prefer source files

### `shared/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "moduleResolution": "node",
    "ignoreDeprecations": "6.0",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

Why this matters:

- `declaration` emits `dist/*.d.ts`
- `declarationMap` preserves editor go-to-definition back to source
- `exclude` avoids recursive noise from previous build output

### `backend/vercel.json`

```json
{
  "version": 2,
  "installCommand": "cd .. && npm install --include=dev && cd shared && npm run build",
  "buildCommand": "true",
  "functions": {
    "api/index.ts": {
      "includeFiles": "../shared/**/*"
    }
  },
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/api/index.ts"
    }
  ]
}
```

Why this matters:

- `functions` is the preferred modern Vercel configuration for function customization
- `builds` is legacy and should not be mixed with `functions`
- `installCommand` runs from the monorepo root, installs required devDependencies, and compiles `shared`
- `buildCommand: "true"` prevents Vercel from auto-running an unwanted repo-wide build
- `includeFiles` must be a single string glob in the current Vercel schema
- `../shared/**/*` ensures both `shared/package.json` and `shared/dist/**` are available inside the function bundle

### `frontend/tsconfig.json`

The manual path alias for `@repo/shared` should be removed:

```diff
  "paths": {
    "@/*": ["./src/*"],
-   "@repo/shared": ["../shared/src/index.ts"]
  }
```

Why this matters:

- A hardcoded alias to `../shared/src/index.ts` bypasses package metadata entirely
- It keeps frontend type resolution tied to raw source even after the package is converted to compiled output

## Why the Earlier Attempts Failed

### Attempt 1: Pointing package metadata at raw `.ts`

This works locally with `ts-node` and similar dev tooling, but it is not safe for a deployed Node.js runtime that expects executable JavaScript.

### Attempt 2: Legacy `builds` with workspace symlinks

The backend project deploys from `backend/` as the Vercel root directory. In a workspace install, `node_modules/@repo/shared` is a symlink that points outside that root. That makes legacy tracing behavior unreliable for this setup.

### Attempt 3: Switching only `main` to `dist`

This was incomplete. Even with:

```json
"main": "./dist/index.js"
```

the package still exposed:

```json
"types": "./src/index.ts"
```

and:

```json
"exports": {
  ".": {
    "types": "./src/index.ts"
  }
}
```

That meant TypeScript resolution still preferred `shared/src/index.ts`, which is exactly the path that appeared in the Vercel error log.

### Attempt 4: Array syntax for `includeFiles`

This failed schema validation on Vercel:

```text
functions.api/index.ts.includeFiles should be string
```

The current Vercel schema expects `includeFiles` to be a single glob string, not an array.

## Validation Performed

The final configuration was validated locally with:

1. `npm --workspace shared run build`
2. `npm --workspace backend run build`
3. `npm --workspace frontend run build`
4. `node -p "require.resolve('@repo/shared')"`
5. `tsc --traceResolution` for both `backend` and `frontend`

Key results:

- Node runtime resolution points to `shared/dist/index.js`
- TypeScript resolution points to `shared/dist/index.d.ts`
- No remaining resolution path points to `shared/src/index.ts`

## Required Vercel Dashboard Setting

The backend Vercel project should have **Include source files outside of the Root Directory in the Build Step** enabled.

Without that setting, the build may not be able to access `../shared/` from the backend project root.

## References

- Vercel project configuration: https://vercel.com/docs/project-configuration/vercel-json
- Vercel monorepos: https://vercel.com/docs/monorepos
- Vercel Node.js runtime: https://vercel.com/docs/functions/configuring-functions/runtime
- Vercel function file inclusion guide: https://vercel.com/guides/how-can-i-use-files-in-serverless-functions
- `@vercel/nft` repository: https://github.com/vercel/nft
- Turborepo TypeScript guide: https://turborepo.dev/docs/guides/tools/typescript
