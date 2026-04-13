import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthResponse } from '@repo/shared';

@Injectable()
export class AuthService {
  private oneTimeCodes = new Map<string, { tokens: AuthResponse; expiresAt: number }>();

  constructor(
    private supabaseService: SupabaseService,
    private configService: ConfigService,
  ) {}

  async register(dto: { email: string; password: string; name?: string }): Promise<AuthResponse> {
    const supabase = this.supabaseService.getClient();

    const { error: createError } = await supabase.auth.admin.createUser({
      email: dto.email,
      password: dto.password,
      email_confirm: true,
      user_metadata: { name: dto.name },
    });

    if (createError) throw new BadRequestException(createError.message);

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

  async login(dto: { email: string; password: string }): Promise<AuthResponse> {
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

  async mergeSessionOnLogin(sessionId: string, userId: string): Promise<void> {
    const supabase = this.supabaseService.getClient();

    await supabase.from('sessions').update({ user_id: userId }).eq('id', sessionId);

    const { data: oldSessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('user_id', userId)
      .neq('id', sessionId);

    if (!oldSessions?.length) return;

    const oldSessionIds = oldSessions.map((s) => s.id);

    const { data: oldItems } = await supabase
      .from('cart_items')
      .select('product_id, quantity')
      .in('session_id', oldSessionIds);

    if (oldItems?.length) {
      const { data: currentItems } = await supabase
        .from('cart_items')
        .select('id, product_id, quantity')
        .eq('session_id', sessionId);

      const currentMap = new Map((currentItems || []).map((item) => [item.product_id, item]));

      for (const oldItem of oldItems) {
        const existing = currentMap.get(oldItem.product_id);
        if (existing) {
          const newQty = Math.min(existing.quantity + oldItem.quantity, 99);
          await supabase.from('cart_items').update({ quantity: newQty }).eq('id', existing.id);
        } else {
          await supabase.from('cart_items').insert({
            session_id: sessionId,
            product_id: oldItem.product_id,
            quantity: oldItem.quantity,
          });
        }
      }
    }

    await supabase.from('sessions').delete().in('id', oldSessionIds);
  }

  async handleLineLogin(code: string, backendOrigin: string): Promise<AuthResponse> {
    const channelId = this.configService.getOrThrow('LINE_LOGIN_CHANNEL_ID');
    const channelSecret = this.configService.getOrThrow('LINE_LOGIN_CHANNEL_SECRET');

    const redirectUri = `${backendOrigin}/api/auth/line/callback`;
    console.log('handleLineLogin: token exchange with redirect_uri =', redirectUri);

    const tokenResponse = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: channelId,
        client_secret: channelSecret,
      }),
    });
    const lineTokens = await tokenResponse.json();
    console.log(
      'handleLineLogin: token response status =',
      tokenResponse.status,
      lineTokens.error ? `error: ${lineTokens.error_description}` : 'OK',
    );

    if (lineTokens.error) {
      throw new BadRequestException(`LINE token exchange failed: ${lineTokens.error_description}`);
    }

    const profileResponse = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${lineTokens.access_token}` },
    });
    const lineProfile = await profileResponse.json();
    console.log('handleLineLogin: profile userId =', lineProfile.userId);

    const supabase = this.supabaseService.getClient();

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('line_user_id', lineProfile.userId)
      .single();

    const lineEmail = `line_${lineProfile.userId}@line.local`;
    // bcrypt has a 72-byte limit; hash the secret material to stay within it
    const hash = createHash('sha256')
      .update(`${lineProfile.userId}_${channelSecret}`)
      .digest('hex');
    const linePassword = hash.slice(0, 64);

    if (existingProfile) {
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
      const { error: createError } = await supabase.auth.admin.createUser({
        email: lineEmail,
        password: linePassword,
        email_confirm: true,
        user_metadata: { name: lineProfile.displayName },
      });
      // Ignore "already registered" — user may exist from a previous partial attempt
      // where auth.users was created but profiles.line_user_id was never set
      if (createError && !createError.message.includes('already been registered')) {
        throw new BadRequestException('LINE signup failed: ' + createError.message);
      }

      const { data: createdUser, error: signInError } = await supabase.auth.signInWithPassword({
        email: lineEmail,
        password: linePassword,
      });

      if (signInError || !createdUser.user || !createdUser.session) {
        throw new BadRequestException(
          'LINE login failed after signup: ' + (signInError?.message ?? 'no session'),
        );
      }

      await supabase
        .from('profiles')
        .update({
          line_user_id: lineProfile.userId,
          name: lineProfile.displayName,
        })
        .eq('id', createdUser.user.id);

      return {
        user: {
          id: createdUser.user.id,
          email: createdUser.user.email!,
        },
        access_token: createdUser.session.access_token,
        refresh_token: createdUser.session.refresh_token,
      };
    }
  }

  async storeOneTimeCode(code: string, tokens: AuthResponse): Promise<void> {
    this.oneTimeCodes.set(code, {
      tokens,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
  }

  async consumeOneTimeCode(code: string): Promise<AuthResponse | null> {
    const entry = this.oneTimeCodes.get(code);
    if (!entry || Date.now() > entry.expiresAt) {
      this.oneTimeCodes.delete(code);
      return null;
    }
    this.oneTimeCodes.delete(code);
    return entry.tokens;
  }

  async storePendingOrder(sessionId: string, formData: Record<string, unknown>): Promise<string> {
    const supabase = this.supabaseService.getClient();
    const { data, error } = await supabase
      .from('pending_line_orders')
      .insert({ session_id: sessionId, form_data: formData })
      .select('id')
      .single();
    if (error || !data) throw new BadRequestException('Failed to store pending order');
    return data.id;
  }

  async consumePendingOrder(
    pendingId: string,
  ): Promise<{ session_id: string; form_data: Record<string, unknown> } | null> {
    const supabase = this.supabaseService.getClient();
    const now = new Date().toISOString();
    console.log('consumePendingOrder: id =', pendingId, ', now =', now);

    const { data, error } = await supabase
      .from('pending_line_orders')
      .select('session_id, form_data')
      .eq('id', pendingId)
      .gt('expires_at', now)
      .single();

    if (error) {
      console.error('consumePendingOrder: query error:', error.code, error.message);
      // Fallback: try without expires_at filter (in case of clock skew)
      const { data: fallback, error: fallbackErr } = await supabase
        .from('pending_line_orders')
        .select('session_id, form_data, expires_at')
        .eq('id', pendingId)
        .single();
      if (fallbackErr) {
        console.error(
          'consumePendingOrder: fallback also failed:',
          fallbackErr.code,
          fallbackErr.message,
        );
        return null;
      }
      if (fallback) {
        console.log(
          'consumePendingOrder: found via fallback (expires_at =',
          fallback.expires_at,
          ')',
        );
        await supabase.from('pending_line_orders').delete().eq('id', pendingId);
        return {
          session_id: fallback.session_id,
          form_data: fallback.form_data as Record<string, unknown>,
        };
      }
      return null;
    }

    if (!data) return null;
    // Delete after consuming
    await supabase.from('pending_line_orders').delete().eq('id', pendingId);
    return data as { session_id: string; form_data: Record<string, unknown> };
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
