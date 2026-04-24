# Implementation Plan: Auth & Cart Session Management

## Overview

This document covers the session-based architecture that enables both guest and authenticated users to use the shopping cart, the login/merge flow, Supabase Auth integration, and LINE Login.

## Core Concept: Session-based Cart

Every visitor (guest or logged-in) is assigned a `session_id` stored as an HttpOnly cookie. Cart items are always linked to a session. When a user logs in, their session is associated with their user ID, and any existing cart from a previous session is merged.

```
┌──────────────┐        ┌───────────────┐       ┌───────────────┐
│  Browser     │        │   NestJS      │       │   Supabase    │
│              │        │   Backend     │       │   (DB + Auth) │
│ Cookie:      │───────>│ Middleware:   │───────>│ sessions      │
│ session_id   │        │ resolve       │       │ cart_items    │
│ Bearer token │        │ session +     │       │ auth.users    │
│ (if logged)  │        │ user          │       │ profiles      │
└──────────────┘        └───────────────┘       └───────────────┘
```

## Files to Modify

### Backend Changes

- `backend/src/supabase/supabase.module.ts` — Supabase client provider
- `backend/src/supabase/supabase.service.ts` — Supabase client service
- `backend/src/auth/auth.module.ts` — Auth module
- `backend/src/auth/auth.controller.ts` — Login, register, logout, LINE callback
- `backend/src/auth/auth.service.ts` — Auth business logic
- `backend/src/auth/guards/auth.guard.ts` — JWT validation guard
- `backend/src/auth/guards/optional-auth.guard.ts` — Optional JWT (doesn't reject guests)
- `backend/src/common/middleware/session.middleware.ts` — Session cookie middleware
- `backend/src/common/decorators/session.decorator.ts` — @Session() parameter decorator
- `backend/src/common/decorators/current-user.decorator.ts` — @CurrentUser() decorator

## Step-by-Step Implementation

### Step 1: Create Supabase Module

**File:** `backend/src/supabase/supabase.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private client: SupabaseClient;

  constructor(private configService: ConfigService) {
    this.client = createClient(
      this.configService.getOrThrow('SUPABASE_URL'),
      this.configService.getOrThrow('SUPABASE_SERVICE_KEY'),
    );
  }

  getClient(): SupabaseClient {
    return this.client;
  }
}
```

**File:** `backend/src/supabase/supabase.module.ts`

```typescript
import { Global, Module } from '@nestjs/common';
import { SupabaseService } from './supabase.service';

@Global()
@Module({
  providers: [SupabaseService],
  exports: [SupabaseService],
})
export class SupabaseModule {}
```

**Rationale:** Global module so every other module can inject SupabaseService without importing.

### Step 2: Install Supabase client

```bash
cd backend && npm install @supabase/supabase-js
```

### Step 3: Create Session Middleware

**File:** `backend/src/common/middleware/session.middleware.ts`

```typescript
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { SupabaseService } from '../../supabase/supabase.service';
import { v4 as uuidv4 } from 'uuid';

// Extend Express Request to include session info
declare global {
  namespace Express {
    interface Request {
      sessionId?: string;
      userId?: string | null;
    }
  }
}

@Injectable()
export class SessionMiddleware implements NestMiddleware {
  constructor(private supabaseService: SupabaseService) {}

  // Review H-17: in-memory session cache (60s TTL) to reduce DB hits
  private sessionCache = new Map<string, { userId: string | null; expiresAt: number }>();
  private CACHE_TTL = 60_000; // 60 seconds

  async use(req: Request, res: Response, next: NextFunction) {
    const supabase = this.supabaseService.getClient();
    let sessionId = req.cookies?.['session_id'];

    if (sessionId) {
      // Check cache first (Review H-17 / 5.1)
      const cached = this.sessionCache.get(sessionId);
      if (cached && Date.now() < cached.expiresAt) {
        req.sessionId = sessionId;
        req.userId = cached.userId;
        // Review M-7: refresh session TTL on access
        supabase
          .from('sessions')
          .update({ expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() })
          .eq('id', sessionId)
          .then();
        return next();
      }

      // Validate session exists and isn't expired
      const { data: session } = await supabase
        .from('sessions')
        .select('id, user_id, expires_at')
        .eq('id', sessionId)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (session) {
        req.sessionId = session.id;
        req.userId = session.user_id;
        this.sessionCache.set(sessionId, {
          userId: session.user_id,
          expiresAt: Date.now() + this.CACHE_TTL,
        });
      } else {
        // Session expired or invalid — will create new one below
        sessionId = null;
      }
    }

    if (!sessionId) {
      // Review H-17: lazy session creation — only create if not a read-only GET
      // For GET requests without a session, skip session creation (products, categories)
      if (
        req.method === 'GET' &&
        !req.path.includes('/cart') &&
        !req.path.includes('/favorites') &&
        !req.path.includes('/orders') &&
        !req.path.includes('/auth/me') &&
        !req.path.includes('/user/')
      ) {
        return next();
      }

      // Create new session
      const newId = uuidv4();
      const { data: newSession } = await supabase
        .from('sessions')
        .insert({ id: newId })
        .select()
        .single();

      if (newSession) {
        req.sessionId = newSession.id;
        req.userId = null;

        // Set cookie (Review M-7: 90-day expiry)
        res.cookie('session_id', newSession.id, {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
          path: '/',
        });
      }
    }

    next();
  }
}
```

**Rationale:** Every request gets a valid session. Cookie is HttpOnly (no JS access) and SameSite=Lax (CSRF protection).

### Step 4: Create Parameter Decorators

**File:** `backend/src/common/decorators/session.decorator.ts`

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const SessionId = createParamDecorator((data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  return request.sessionId;
});
```

**File:** `backend/src/common/decorators/current-user.decorator.ts`

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.user; // set by AuthGuard
});
```

### Step 5: Create Auth Guard

**File:** `backend/src/auth/guards/auth.guard.ts`

```typescript
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private supabaseService: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    const token = authHeader.split(' ')[1];
    const supabase = this.supabaseService.getClient();

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    request.user = user;
    return true;
  }
}
```

**File:** `backend/src/auth/guards/optional-auth.guard.ts`

```typescript
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private supabaseService: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const supabase = this.supabaseService.getClient();
      const {
        data: { user },
      } = await supabase.auth.getUser(token);
      if (user) {
        request.user = user;
      }
    }

    return true; // Always allows request through
  }
}
```

### Step 6: Create Auth Service

**File:** `backend/src/auth/auth.service.ts`

```typescript
import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { LoginRequest, RegisterRequest, AuthResponse } from '@repo/shared';

@Injectable()
export class AuthService {
  constructor(private supabaseService: SupabaseService) {}

  async register(dto: RegisterRequest): Promise<AuthResponse> {
    const supabase = this.supabaseService.getClient();

    // Review H-15: use admin API to create user with auto-confirm,
    // then sign in immediately to get a session. This avoids null session
    // when email confirmation is enabled in Supabase.
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: dto.email,
      password: dto.password,
      email_confirm: true,
      user_metadata: { name: dto.name },
    });

    if (createError) throw new BadRequestException(createError.message);

    // Sign in to get session tokens
    const { data, error } = await supabase.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });

    if (error) throw new BadRequestException(error.message);

    return {
      user: { id: data.user.id, email: data.user.email! },
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    };
  }

  async login(dto: LoginRequest): Promise<AuthResponse> {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });

    if (error) throw new UnauthorizedException(error.message);

    return {
      user: { id: data.user.id, email: data.user.email! },
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    };
  }

  /**
   * After login, associate the current session with the user
   * and merge any existing cart items from old sessions.
   */
  async mergeSessionOnLogin(sessionId: string, userId: string): Promise<void> {
    const supabase = this.supabaseService.getClient();

    // 1. Assign current session to user
    await supabase.from('sessions').update({ user_id: userId }).eq('id', sessionId);

    // 2. Find old sessions for this user (excluding current)
    const { data: oldSessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('user_id', userId)
      .neq('id', sessionId);

    if (!oldSessions?.length) return;

    const oldSessionIds = oldSessions.map((s) => s.id);

    // 3. Get cart items from old sessions
    const { data: oldItems } = await supabase
      .from('cart_items')
      .select('product_id, quantity')
      .in('session_id', oldSessionIds);

    if (oldItems?.length) {
      // 4. Get current session's cart items
      const { data: currentItems } = await supabase
        .from('cart_items')
        .select('id, product_id, quantity')
        .eq('session_id', sessionId);

      const currentMap = new Map((currentItems || []).map((item) => [item.product_id, item]));

      // 5. Merge: sum quantities for same product, add new products
      for (const oldItem of oldItems) {
        const existing = currentMap.get(oldItem.product_id);
        if (existing) {
          await supabase
            .from('cart_items')
            .update({ quantity: existing.quantity + oldItem.quantity })
            .eq('id', existing.id);
        } else {
          await supabase.from('cart_items').insert({
            session_id: sessionId,
            product_id: oldItem.product_id,
            quantity: oldItem.quantity,
          });
        }
      }
    }

    // 6. Delete old sessions (cascades to their cart_items)
    await supabase.from('sessions').delete().in('id', oldSessionIds);
  }

  async getMe(userId: string) {
    const supabase = this.supabaseService.getClient();

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single();

    const {
      data: { user },
    } = await supabase.auth.admin.getUserById(userId);

    return {
      id: userId,
      email: user?.email || '',
      name: profile?.name || null,
      phone: profile?.phone || null,
      preferred_language: profile?.preferred_language || 'zh',
      line_user_id: profile?.line_user_id || null,
    };
  }
}
```

### Step 7: Create Auth Controller

**File:** `backend/src/auth/auth.controller.ts`

```typescript
import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard } from './guards/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { LoginRequest, RegisterRequest } from '@repo/shared';

@ApiTags('Auth')
@Controller('api/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterRequest, @Req() req: Request) {
    const result = await this.authService.register(dto);
    // Merge guest cart into new user's session
    if (req.sessionId) {
      await this.authService.mergeSessionOnLogin(req.sessionId, result.user.id);
    }
    return result;
  }

  @Post('login')
  async login(@Body() dto: LoginRequest, @Req() req: Request) {
    const result = await this.authService.login(dto);
    // Merge guest cart into user's session
    if (req.sessionId) {
      await this.authService.mergeSessionOnLogin(req.sessionId, result.user.id);
    }
    return result;
  }

  @Post('logout')
  async logout(@Req() req: Request) {
    const supabase = this.authService['supabaseService'].getClient();
    // Disassociate session from user
    if (req.sessionId) {
      await supabase.from('sessions').update({ user_id: null }).eq('id', req.sessionId);
    }
    return { success: true };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@CurrentUser() user: any) {
    return this.authService.getMe(user.id);
  }
}
```

### Step 8: Register Middleware in AppModule

**File:** `backend/src/app.module.ts`

```typescript
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { SessionMiddleware } from './common/middleware/session.middleware';
// ... other module imports

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SupabaseModule,
    AuthModule,
    // ... other modules
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(SessionMiddleware)
      .exclude('api/webhooks/(.*)') // Review H-6: exclude webhooks from session middleware
      .forRoutes('api/*');
  }
}
```

### Step 9: Install Dependencies

```bash
cd backend && npm install @supabase/supabase-js uuid cookie-parser
cd backend && npm install -D @types/uuid @types/cookie-parser
```

### Step 10: Enable cookie-parser in main.ts

**File:** `backend/src/main.ts` — Add before `app.listen()`:

```typescript
import * as cookieParser from 'cookie-parser';

// In bootstrap():
app.use(cookieParser());
```

## LINE Login Flow

### Step 11: LINE Login Callback

LINE Login uses OAuth2. The frontend redirects to LINE's auth page, which redirects back with a `code`.

**File:** `backend/src/auth/auth.controller.ts` — Add:

```typescript
// Review C-2: use a short-lived one-time code instead of passing tokens in URL
@Get('line/callback')
async lineCallback(
  @Query('code') code: string,
  @Query('state') state: string,
  @Req() req: Request,
  @Res() res: Response,
) {
  const result = await this.authService.handleLineLogin(code);

  // Merge guest cart
  if (req.sessionId) {
    await this.authService.mergeSessionOnLogin(req.sessionId, result.user.id);
  }

  // Store tokens in a short-lived record, redirect with one-time code
  const oneTimeCode = crypto.randomUUID();
  await this.authService.storeOneTimeCode(oneTimeCode, {
    access_token: result.access_token,
    refresh_token: result.refresh_token,
  });

  res.redirect(`${process.env.FRONTEND_URL}/auth/callback?code=${oneTimeCode}`);
}

// Frontend calls this endpoint to exchange the one-time code for tokens
@Post('line/exchange')
async exchangeLineCode(@Body() body: { code: string }) {
  const tokens = await this.authService.consumeOneTimeCode(body.code);
  if (!tokens) throw new UnauthorizedException('Invalid or expired code');
  return tokens;
}
```

**One-time code storage** (add to AuthService):

```typescript
// In-memory store with 5-minute TTL. For production, use Redis.
private oneTimeCodes = new Map<string, { tokens: AuthResponse; expiresAt: number }>();

async storeOneTimeCode(code: string, tokens: AuthResponse): Promise<void> {
  this.oneTimeCodes.set(code, { tokens, expiresAt: Date.now() + 5 * 60 * 1000 });
}

async consumeOneTimeCode(code: string): Promise<AuthResponse | null> {
  const entry = this.oneTimeCodes.get(code);
  if (!entry || Date.now() > entry.expiresAt) {
    this.oneTimeCodes.delete(code);
    return null;
  }
  this.oneTimeCodes.delete(code); // one-time use
  return entry.tokens;
}
```

**In AuthService — handleLineLogin():**

```typescript
async handleLineLogin(code: string) {
  // 1. Exchange code for LINE tokens
  const tokenResponse = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${process.env.BACKEND_URL}/api/auth/line/callback`,
      client_id: process.env.LINE_LOGIN_CHANNEL_ID!,
      client_secret: process.env.LINE_LOGIN_CHANNEL_SECRET!,
    }),
  });
  const lineTokens = await tokenResponse.json();

  // 2. Get LINE user profile
  const profileResponse = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${lineTokens.access_token}` },
  });
  const lineProfile = await profileResponse.json();

  // 3. Find or create Supabase user
  const supabase = this.supabaseService.getClient();

  // Check if user exists with this LINE ID
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('line_user_id', lineProfile.userId)
    .single();

  // Review H-14: complete implementation using admin API + signInWithPassword
  const lineEmail = `line_${lineProfile.userId}@line.local`;
  const linePassword = `line_pw_${lineProfile.userId}_${process.env.LINE_LOGIN_CHANNEL_SECRET}`;

  if (existingProfile) {
    // User exists — sign in with the deterministic password
    const { data, error } = await supabase.auth.signInWithPassword({
      email: lineEmail,
      password: linePassword,
    });
    if (error) throw new BadRequestException('LINE login failed: ' + error.message);

    return {
      user: { id: data.user.id, email: data.user.email! },
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    };
  } else {
    // Create new user with deterministic password
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: lineEmail,
      password: linePassword,
      email_confirm: true,
      user_metadata: { name: lineProfile.displayName },
    });
    if (createError) throw new BadRequestException('LINE signup failed: ' + createError.message);

    // Update profile with LINE user ID
    await supabase
      .from('profiles')
      .update({
        line_user_id: lineProfile.userId,
        name: lineProfile.displayName,
      })
      .eq('id', newUser.user!.id);

    // Sign in to get session tokens
    const { data, error } = await supabase.auth.signInWithPassword({
      email: lineEmail,
      password: linePassword,
    });
    if (error) throw new BadRequestException('LINE login failed after signup: ' + error.message);

    return {
      user: { id: data.user.id, email: data.user.email! },
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    };
  }
}
```

## Session Lifecycle Diagram

```
Guest visits site
       │
       ▼
SessionMiddleware creates new session
  → session_id cookie set
  → sessions row: { id: UUID, user_id: null }
       │
       ▼
Guest adds items to cart
  → cart_items rows linked to session_id
       │
       ▼
Guest decides to login
       │
       ▼
POST /api/auth/login
  → Supabase validates credentials
  → mergeSessionOnLogin():
      1. UPDATE sessions SET user_id = ? WHERE id = current_session
      2. Find old sessions for this user
      3. Merge old cart items into current session
      4. Delete old sessions
  → Return JWT tokens
       │
       ▼
Authenticated requests include both:
  - Cookie: session_id (auto-sent by browser)
  - Authorization: Bearer <access_token>
       │
       ▼
User logs out
  → POST /api/auth/logout
  → sessions.user_id = null (session stays)
  → Cart items remain accessible as guest
```

## Environment Variables Needed

Add to `backend/.env`:

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
FRONTEND_URL=http://localhost:3001
BACKEND_URL=http://localhost:3000
LINE_LOGIN_CHANNEL_ID=
LINE_LOGIN_CHANNEL_SECRET=
```

## Testing Steps

1. Start backend, make a request → verify `session_id` cookie is set
2. Add item to cart as guest → verify cart_items record created
3. Login → verify session.user_id is updated, cart items preserved
4. Login from a different browser with existing cart → verify cart merge
5. Logout → verify session.user_id is cleared, cart items still accessible

## Dependencies

- Must complete before: backend-api.md (CartModule, OrderModule)
- Depends on: database-schema.md, Supabase project setup

## Notes

- The session middleware now includes an in-memory cache (60s TTL) to reduce DB hits (Review H-17 / 5.1).
- Sessions are only created lazily on write operations, not on read-only GETs (Review H-17).
- LINE Login creates "fake" email addresses (`line_xxx@line.local`) in Supabase Auth. These users can only log in via LINE.
- The `mergeSessionOnLogin` method is idempotent — calling it multiple times won't duplicate cart items due to the UNIQUE constraint on `(session_id, product_id)`. However, for race condition safety (Review H-11), consider wrapping merge logic in a Supabase RPC function as a single transaction for production.
- Cookie `SameSite=Lax` ensures the cookie is sent on top-level navigations (important for LINE OAuth redirect back).
- **Review C-5 (cross-origin cookies):** In production, use the Next.js API rewrite proxy so frontend and backend share the same origin. This avoids cross-domain cookie issues entirely. The rewrite is already configured in `next.config.ts`.
- **Review M-3 (CSRF):** The Next.js proxy approach keeps cookies same-origin, eliminating most CSRF vectors. Additional CSRF token protection is a future hardening task.
- **Review M-4 (rate limiting):** Add `@nestjs/throttler` to auth endpoints. Apply `@Throttle(5, 60)` to login/register.
