import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { SupabaseService } from '../../supabase/supabase.service';
import { randomUUID } from 'crypto';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      sessionId?: string;
      userId?: string | null;
      user?: any;
    }
  }
}

@Injectable()
export class SessionMiddleware implements NestMiddleware {
  constructor(private supabaseService: SupabaseService) {}

  private sessionCache = new Map<string, { userId: string | null; expiresAt: number }>();
  private CACHE_TTL = 60_000;
  private MAX_CACHE_SIZE = 10_000;

  private evictStaleEntries() {
    if (this.sessionCache.size <= this.MAX_CACHE_SIZE) return;
    const now = Date.now();
    for (const [key, val] of this.sessionCache) {
      if (now >= val.expiresAt) this.sessionCache.delete(key);
    }
    // If still over limit after evicting expired, drop oldest half
    if (this.sessionCache.size > this.MAX_CACHE_SIZE) {
      const keys = [...this.sessionCache.keys()];
      for (let i = 0; i < keys.length / 2; i++) {
        this.sessionCache.delete(keys[i]);
      }
    }
  }

  async use(req: Request, res: Response, next: NextFunction) {
    const supabase = this.supabaseService.getClient();
    let sessionId = req.cookies?.['session_id'];

    if (sessionId) {
      const cached = this.sessionCache.get(sessionId);
      if (cached && Date.now() < cached.expiresAt) {
        req.sessionId = sessionId;
        req.userId = cached.userId;
        supabase
          .from('sessions')
          .update({
            expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          })
          .eq('id', sessionId)
          .then();
        return next();
      }

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
        this.evictStaleEntries();
      } else {
        sessionId = null;
      }
    }

    if (!sessionId) {
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

      const newId = randomUUID();
      const { data: newSession } = await supabase
        .from('sessions')
        .insert({ id: newId })
        .select()
        .single();

      if (newSession) {
        req.sessionId = newSession.id;
        req.userId = null;

        res.cookie('session_id', newSession.id, {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          maxAge: 90 * 24 * 60 * 60 * 1000,
          path: '/',
        });
      }
    }

    next();
  }
}
