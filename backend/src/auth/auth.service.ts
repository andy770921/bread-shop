import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthResponse } from '@repo/shared';

type LineLoginResult = AuthResponse & {
  lineAccessToken: string;
  lineUserId: string;
  preserveExistingSession?: boolean;
};

@Injectable()
export class AuthService {
  private oneTimeCodes = new Map<string, { tokens: AuthResponse; expiresAt: number }>();

  constructor(
    private supabaseService: SupabaseService,
    private configService: ConfigService,
  ) {}

  async register(dto: { email: string; password: string; name?: string }): Promise<AuthResponse> {
    const authClient = this.supabaseService.getAuthClient();

    const { error: createError } = await authClient.auth.admin.createUser({
      email: dto.email,
      password: dto.password,
      email_confirm: true,
      user_metadata: { name: dto.name },
    });

    if (createError) throw new BadRequestException(createError.message);

    const { data, error } = await authClient.auth.signInWithPassword({
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
    const authClient = this.supabaseService.getAuthClient();

    const { data, error } = await authClient.auth.signInWithPassword({
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

    // Link current session to user
    await supabase.from('sessions').update({ user_id: userId }).eq('id', sessionId);

    // Find the target cart: session cart or create one
    let { data: targetCart } = await supabase
      .from('carts')
      .select('id')
      .eq('session_id', sessionId)
      .eq('status', 'active')
      .maybeSingle();

    // Also check if user already has an active cart from a previous session
    const { data: userCart } = await supabase
      .from('carts')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (!targetCart && userCart) {
      // User already has a cart from a different session — use it as target
      targetCart = userCart;
    } else if (targetCart && userCart && targetCart.id !== userCart.id) {
      // Both exist — merge user's old cart lines into the session cart
      const { data: oldLines } = await supabase
        .from('cart_lines')
        .select('product_id, quantity')
        .eq('cart_id', userCart.id);

      for (const line of oldLines || []) {
        await supabase.rpc('upsert_cart_line', {
          p_cart_id: targetCart.id,
          p_product_id: line.product_id,
          p_quantity: line.quantity,
        });
      }

      // Mark old user cart as merged
      await supabase
        .from('carts')
        .update({ status: 'merged', merged_into_cart_id: targetCart.id })
        .eq('id', userCart.id);
    }

    // Assign user_id to the target cart
    if (targetCart) {
      await supabase.from('carts').update({ user_id: userId }).eq('id', targetCart.id);
      await supabase.rpc('refresh_cart_aggregates', { p_cart_id: targetCart.id });
    }

    // Clean up old sessions (keep the current one)
    const { data: oldSessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('user_id', userId)
      .neq('id', sessionId);

    if (oldSessions?.length) {
      const oldSessionIds = oldSessions.map((s) => s.id);
      await supabase.from('sessions').delete().in('id', oldSessionIds);
    }
  }

  async handleLineLogin(
    code: string,
    backendOrigin: string,
    linkToUserId?: string,
  ): Promise<LineLoginResult> {
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
    const authClient = this.supabaseService.getAuthClient();

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('line_user_id', lineProfile.userId)
      .maybeSingle();

    if (linkToUserId) {
      const { data: targetProfile } = await supabase
        .from('profiles')
        .select('id, name, line_user_id')
        .eq('id', linkToUserId)
        .maybeSingle();

      if (!targetProfile) {
        throw new BadRequestException('Original user not found');
      }

      if (existingProfile && existingProfile.id !== linkToUserId) {
        throw new BadRequestException('This LINE account is already linked to another user.');
      }

      if (targetProfile.line_user_id && targetProfile.line_user_id !== lineProfile.userId) {
        throw new BadRequestException(
          'This Bread Shop account is already linked to a different LINE account.',
        );
      }

      if (!targetProfile.line_user_id) {
        const profileUpdates: { line_user_id: string; name?: string } = {
          line_user_id: lineProfile.userId,
        };
        if (!targetProfile.name) {
          profileUpdates.name = lineProfile.displayName;
        }

        const { error: updateError } = await supabase
          .from('profiles')
          .update(profileUpdates)
          .eq('id', linkToUserId);

        if (updateError) {
          throw new BadRequestException('Failed to link LINE account: ' + updateError.message);
        }
      }

      const {
        data: { user: linkedUser },
        error: linkedUserError,
      } = await supabase.auth.admin.getUserById(linkToUserId);

      if (linkedUserError || !linkedUser?.email) {
        throw new BadRequestException('Original user not found');
      }

      return {
        user: { id: linkedUser.id, email: linkedUser.email },
        access_token: '',
        refresh_token: '',
        lineAccessToken: lineTokens.access_token,
        lineUserId: lineProfile.userId,
        preserveExistingSession: true,
      };
    }

    const lineEmail = `line_${lineProfile.userId}@line.local`;
    // bcrypt has a 72-byte limit; hash the secret material to stay within it
    const hash = createHash('sha256')
      .update(`${lineProfile.userId}_${channelSecret}`)
      .digest('hex');
    const linePassword = hash.slice(0, 64);

    if (existingProfile) {
      const { data, error } = await authClient.auth.signInWithPassword({
        email: lineEmail,
        password: linePassword,
      });
      if (error) throw new BadRequestException('LINE login failed: ' + error.message);

      return {
        user: { id: data.user.id, email: data.user.email! },
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        lineAccessToken: lineTokens.access_token,
        lineUserId: lineProfile.userId,
      };
    } else {
      const { error: createError } = await authClient.auth.admin.createUser({
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

      const { data: createdUser, error: signInError } = await authClient.auth.signInWithPassword({
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
        lineAccessToken: lineTokens.access_token,
        lineUserId: lineProfile.userId,
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

  async readPendingOrder(
    pendingId: string,
  ): Promise<{ session_id: string; form_data: Record<string, unknown> } | null> {
    const supabase = this.supabaseService.getClient();
    const now = new Date().toISOString();
    console.log('readPendingOrder: id =', pendingId, ', now =', now);

    const { data, error } = await supabase
      .from('pending_line_orders')
      .select('session_id, form_data')
      .eq('id', pendingId)
      .gt('expires_at', now)
      .single();

    if (error) {
      console.error('readPendingOrder: query error:', error.code, error.message);
      // Fallback without expires_at filter (clock skew)
      const { data: fallback, error: fallbackErr } = await supabase
        .from('pending_line_orders')
        .select('session_id, form_data, expires_at')
        .eq('id', pendingId)
        .single();
      if (fallbackErr) {
        console.error('readPendingOrder: fallback failed:', fallbackErr.code, fallbackErr.message);
        return null;
      }
      if (fallback) {
        console.log('readPendingOrder: found via fallback (expires_at =', fallback.expires_at, ')');
        return {
          session_id: fallback.session_id,
          form_data: fallback.form_data as Record<string, unknown>,
        };
      }
      return null;
    }

    if (!data) return null;
    return data as { session_id: string; form_data: Record<string, unknown> };
  }

  /**
   * Atomically delete and return the pending order. Returns null if already deleted
   * (e.g., by a concurrent request). Used as a lock to prevent duplicate orders.
   */
  async deletePendingOrder(
    pendingId: string,
  ): Promise<{ session_id: string; form_data: Record<string, unknown> } | null> {
    const supabase = this.supabaseService.getClient();
    const { data } = await supabase
      .from('pending_line_orders')
      .delete()
      .eq('id', pendingId)
      .select('session_id, form_data')
      .single();
    return data as { session_id: string; form_data: Record<string, unknown> } | null;
  }

  /** Store auth data in the pending order so the confirm-order endpoint can use it later. */
  async updatePendingOrderAuth(
    pendingId: string,
    auth: { lineUserId: string; userId: string },
  ): Promise<void> {
    const supabase = this.supabaseService.getClient();
    // Read current form_data, merge auth into it, extend expiration to 30 min
    const { data: current } = await supabase
      .from('pending_line_orders')
      .select('form_data')
      .eq('id', pendingId)
      .single();
    if (!current) return;
    const updatedFormData = {
      ...(current.form_data as Record<string, unknown>),
      _line_user_id: auth.lineUserId,
      _user_id: auth.userId,
    };
    await supabase
      .from('pending_line_orders')
      .update({
        form_data: updatedFormData,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      })
      .eq('id', pendingId);
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
