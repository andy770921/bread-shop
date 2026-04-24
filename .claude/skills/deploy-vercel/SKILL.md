---
description: Deploy frontend and/or backend to Vercel with step-by-step guidance
---

# Deploy to Vercel

Guide the user through deploying this fullstack application to Vercel. Both frontend (Next.js) and backend (NestJS) are configured for Vercel deployment.

## TICKET Resolution

**If `$ARGUMENTS` is empty or not provided:**

1. Scan the `documents/` folder for existing FEAT-X folders
2. Find the highest number X in FEAT-X folders
3. Use `FEAT-{X+1}` as the new TICKET
4. Example: If FEAT-1, FEAT-2 exist → use FEAT-3

**If `$ARGUMENTS` is provided:**

- If folder exists → extend existing documents
- If folder doesn't exist → create new folder

**Prefix rules:**

- Deployment → `FEAT-X` (or use existing ticket if deploying a feature)

## Overview

| App      | Type       | Config                                 | URL Pattern           |
| -------- | ---------- | -------------------------------------- | --------------------- |
| Frontend | Static/SSR | `frontend/vercel.json`                 | `your-app.vercel.app` |
| Backend  | Serverless | `backend/vercel.json` + `api/index.ts` | `your-api.vercel.app` |

## Process

### Step 1: Determine Deployment Target

Ask the user: "What would you like to deploy?"

1. Frontend only
2. Backend only
3. Both frontend and backend

### Step 2: Prerequisites Check

Verify with user:

- [ ] Vercel account created at https://vercel.com
- [ ] Git repository pushed to GitHub/GitLab/Bitbucket
- [ ] Vercel CLI installed (optional): `npm i -g vercel`

### Step 3: Deploy Based on Selection

---

## Frontend Deployment

### Configuration

The frontend is pre-configured in `frontend/vercel.json`:

```json
{
  "framework": "nextjs"
}
```

### Deployment Steps

#### Option A: Vercel Dashboard (Recommended for first deploy)

1. **Go to Vercel**
   - Visit https://vercel.com/new
   - Click "Import Project"

2. **Import Repository**
   - Connect your Git provider (GitHub/GitLab/Bitbucket)
   - Select this repository

3. **Configure Project**
   - **Project Name**: Choose a name (e.g., `my-app-frontend`)
   - **Root Directory**: Click "Edit" → Enter `frontend`
   - **Framework Preset**: Should auto-detect as "Next.js"
   - **Build Command**: `next build` (auto-filled)
   - **Output Directory**: `.next` (auto-filled)

4. **Environment Variables** (if needed)
   - Add any `NEXT_PUBLIC_*` environment variables
   - Example: `NEXT_PUBLIC_API_URL` = `https://your-api.vercel.app`

5. **Deploy**
   - Click "Deploy"
   - Wait for build to complete (~1-2 minutes)

#### Option B: Vercel CLI

```bash
cd frontend
vercel

# Follow prompts:
# - Set up and deploy? Yes
# - Which scope? Select your account
# - Link to existing project? No (first time)
# - Project name? my-app-frontend
# - Directory? ./
# - Override settings? No
```

### Post-Deployment

- Note the deployment URL (e.g., `https://my-app-frontend.vercel.app`)
- Set up custom domain in Project Settings → Domains (optional)

---

## Backend Deployment

### Configuration

The backend uses serverless functions via:

- `backend/vercel.json` - Routes and build config
- `backend/api/index.ts` - NestJS serverless handler

```json
{
  "version": 2,
  "builds": [{ "src": "api/index.ts", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "api/index.ts" }]
}
```

### Important Limitations

| Limitation                | Details                    | Workaround                         |
| ------------------------- | -------------------------- | ---------------------------------- |
| Cold Starts               | First request ~1-2s slower | Use cron to keep warm              |
| Timeout                   | 10s (Hobby), 60s (Pro)     | Split long operations              |
| No WebSockets             | Not supported              | Use polling or Pusher/Ably         |
| No Persistent Connections | Serverless is stateless    | Use external DB connection pooling |
| Memory                    | 1024MB default             | Increase in vercel.json if needed  |

### Deployment Steps

#### Option A: Vercel Dashboard

1. **Go to Vercel**
   - Visit https://vercel.com/new
   - Click "Import Project"

2. **Import Repository** (same repo, new project)
   - Select the same repository
   - This creates a SEPARATE project for backend

3. **Configure Project**
   - **Project Name**: Choose a name (e.g., `my-app-api`)
   - **Root Directory**: Click "Edit" → Enter `backend`
   - **Framework Preset**: Select "Other"
   - Leave build settings as default (vercel.json handles it)

4. **Environment Variables**
   - `NODE_ENV` = `production`
   - Add database URLs, API keys, etc.
   - **Important**: Add `CORS_ORIGIN` with frontend URL

5. **Deploy**
   - Click "Deploy"
   - Wait for build (~2-3 minutes)

#### Option B: Vercel CLI

```bash
cd backend
vercel

# Follow prompts similar to frontend
```

### Post-Deployment

- Test API: `curl https://your-api.vercel.app/health`
- Check logs: Vercel Dashboard → Project → Deployments → Functions tab

---

## Step 4: Connect Frontend to Backend

After both are deployed:

1. **Set Frontend Environment Variable**
   - Go to Frontend project in Vercel
   - Settings → Environment Variables
   - Add: `NEXT_PUBLIC_API_URL` = `https://your-api.vercel.app`
   - Redeploy frontend

2. **Set Backend CORS**
   - Go to Backend project in Vercel
   - Settings → Environment Variables
   - Add: `CORS_ORIGIN` = `https://your-frontend.vercel.app`
   - Redeploy backend

3. **Frontend API calls** are routed through `src/lib/api-client.ts`:
   ```typescript
   // api-client.ts reads NEXT_PUBLIC_API_URL automatically
   // All API calls go through apiClient.{resource}.{method}()
   // Next.js rewrites /api/* → backend in development
   ```

---

## Step 5: Document Deployment

**Determine TICKET:**

- If `$ARGUMENTS` provided → use `$ARGUMENTS`
- If empty → auto-generate next `FEAT-X` number

Create deployment record at: `documents/{TICKET}/development/deployment-vercel.md`

```markdown
# Vercel Deployment: [Date]

## Deployed Applications

### Frontend

- **URL**: https://[your-frontend].vercel.app
- **Project**: [project-name]
- **Root Directory**: frontend
- **Environment Variables**:
  - NEXT_PUBLIC_API_URL: [backend-url]

### Backend

- **URL**: https://[your-api].vercel.app
- **Project**: [project-name]
- **Root Directory**: backend
- **Environment Variables**:
  - NODE_ENV: production
  - CORS_ORIGIN: [frontend-url]
  - [other secrets...]

## Deployment Checklist

- [ ] Frontend deployed
- [ ] Backend deployed
- [ ] CORS configured
- [ ] Environment variables set
- [ ] Health check passing
- [ ] Custom domain configured (optional)

## Notes

[Any deployment-specific notes]
```

---

## Troubleshooting

### Common Issues

#### "Module not found" errors

- Check that all dependencies are in `dependencies`, not just `devDependencies`
- Serverless may not install devDependencies in production

#### CORS errors

- Verify `CORS_ORIGIN` environment variable is set correctly
- Check backend `app.enableCors()` configuration

#### Cold start too slow

- Keep functions warm with external cron service
- Consider Edge Functions for faster cold starts

#### Build timeout

- Increase memory in vercel.json: `"functions": { "api/index.ts": { "memory": 1024 } }`
- Split large builds

#### 404 on API routes

- Verify `vercel.json` routes configuration
- Check that `api/index.ts` is being built

### Vercel Logs

```bash
# View logs via CLI
vercel logs your-project.vercel.app

# Or in dashboard:
# Project → Deployments → [Latest] → Functions → View Logs
```

---

## References

- [Vercel NestJS Documentation](https://vercel.com/docs/frameworks/backend/nestjs)
- [Vercel Next.js Documentation](https://vercel.com/docs/frameworks/nextjs)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
- [Vercel Serverless Functions](https://vercel.com/docs/concepts/functions/serverless-functions)

## Notes

- Always inform user which TICKET number is being used
