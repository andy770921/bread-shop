import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { createHmac } from 'crypto';
import { AuthService } from './auth.service';
import { AuthGuard } from './guards/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SupabaseService } from '../supabase/supabase.service';
import { OrderService } from '../order/order.service';
import { LineService } from '../line/line.service';

@ApiTags('Auth')
@Controller('api/auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private supabaseService: SupabaseService,
    private configService: ConfigService,
    private orderService: OrderService,
    private lineService: LineService,
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    const result = await this.authService.register(dto);
    if (req.sessionId) {
      await this.authService.mergeSessionOnLogin(req.sessionId, result.user.id);
    }
    return result;
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const result = await this.authService.login(dto);
    if (req.sessionId) {
      await this.authService.mergeSessionOnLogin(req.sessionId, result.user.id);
    }
    return result;
  }

  @Post('logout')
  async logout(@Req() req: Request) {
    const supabase = this.supabaseService.getClient();
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

  /**
   * Store form data on the server before LINE Login redirect.
   * Returns a pendingId that the frontend passes to GET /api/auth/line.
   */
  @Post('line/start')
  async lineStart(@Req() req: Request, @Body() body: { form_data: Record<string, unknown> }) {
    const sessionId = req.sessionId;
    if (!sessionId) {
      throw new UnauthorizedException('No session');
    }
    // Strip _ prefixed fields from client data to prevent injection of internal fields
    const safeFormData = Object.fromEntries(
      Object.entries(body.form_data).filter(([k]) => !k.startsWith('_')),
    );
    // Snapshot the cart now — session cookies may be lost during LINE OAuth redirect
    // on mobile (LINE in-app browser, Safari ITP). The snapshot is used for:
    // 1. Displaying order details on the pending confirmation page
    // 2. Fallback for order creation if the session cart is empty after redirect
    const cart = await this.orderService.getCartForSession(sessionId);
    const pendingId = await this.authService.storePendingOrder(sessionId, {
      ...safeFormData,
      _cart_snapshot: cart,
    });
    return { pendingId };
  }

  @Get('line')
  async lineLogin(
    @Query('pending') pendingId: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const channelId = this.configService.getOrThrow('LINE_LOGIN_CHANNEL_ID');
    const channelSecret = this.configService.getOrThrow('LINE_LOGIN_CHANNEL_SECRET');
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const redirectUri = encodeURIComponent(`${protocol}://${host}/api/auth/line/callback`);

    // Encode pendingId in the state using HMAC signature for integrity
    let state: string;
    if (pendingId) {
      const sig = createHmac('sha256', channelSecret).update(pendingId).digest('hex').slice(0, 16);
      state = `${pendingId}.${sig}`;
    } else {
      state = randomUUID();
    }

    // bot_prompt=aggressive shows a full-screen prompt to add the linked Messaging
    // API bot as a friend during LINE Login. Without this, pushMessage to the user
    // fails because they haven't friended the bot. Requires the LINE Login channel
    // to be linked to the Messaging API channel in the LINE developer console.
    const lineAuthUrl = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${channelId}&redirect_uri=${redirectUri}&state=${encodeURIComponent(state)}&scope=profile%20openid&bot_prompt=aggressive`;
    res.redirect(lineAuthUrl);
  }

  @Get('line/callback')
  async lineCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') loginError: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    if (!frontendUrl) {
      res.status(500).json({ error: 'FRONTEND_URL not set' });
      return;
    }

    // If user declined LINE Login, redirect to failure page
    if (loginError) {
      console.log('lineCallback: user declined LINE login, error =', loginError);
      const failUrl = `${frontendUrl}/checkout/failed?reason=login_declined`;
      res.redirect(failUrl);
      return;
    }

    try {
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      const host = req.get('host');
      const backendOrigin = `${protocol}://${host}`;

      // Decode pendingId from state (if present)
      let pendingId: string | null = null;
      const channelSecret = this.configService.getOrThrow('LINE_LOGIN_CHANNEL_SECRET');
      console.log('lineCallback: raw state =', state);
      if (state && state.includes('.')) {
        const [id, sig] = state.split('.');
        const expectedSig = createHmac('sha256', channelSecret)
          .update(id)
          .digest('hex')
          .slice(0, 16);
        console.log('lineCallback: state decode — id =', id, ', sig match =', sig === expectedSig);
        if (sig === expectedSig) {
          pendingId = id;
        }
      } else {
        console.log('lineCallback: state has no dot — not a pending order flow');
      }

      // Read pending order BEFORE handleLineLogin (defense-in-depth
      // against Supabase client auth contamination from signInWithPassword).
      // Does NOT delete — we may need it for the "pending confirmation" page.
      let pending: { session_id: string; form_data: Record<string, unknown> } | null = null;
      if (pendingId) {
        pending = await this.authService.readPendingOrder(pendingId);
        console.log('lineCallback: readPendingOrder result =', pending ? 'found' : 'null');
        if (!pending) {
          // Pending order expired or was already consumed — redirect to cart with error
          const errorUrl = `${frontendUrl}/cart?error=${encodeURIComponent('Order request expired. Please try again.')}`;
          res.redirect(errorUrl);
          return;
        }
      }

      // LINE Login: exchange code, create/sign-in user
      const result = await this.authService.handleLineLogin(code, backendOrigin);

      if (pending && pendingId) {
        const isFriend = await this.checkLineFriendship(result.lineUserId);
        console.log('lineCallback: friendship status =', isFriend);

        if (!isFriend) {
          // User is NOT friends with the bot. Store auth data in the pending order
          // so the confirm-order endpoint can use it later, then redirect to the
          // "pending confirmation" page where user can add the bot and retry.
          await this.authService.updatePendingOrderAuth(pendingId, {
            lineUserId: result.lineUserId,
            userId: result.user.id,
          });
          const tokenParams = new URLSearchParams({
            access_token: result.access_token,
            refresh_token: result.refresh_token,
          });
          const pendingUrl = `${frontendUrl}/checkout/pending?pendingId=${pendingId}#${tokenParams.toString()}`;
          res.redirect(pendingUrl);
          return;
        }

        // User IS friends — atomically consume and create order
        const consumed = await this.authService.deletePendingOrder(pendingId);
        if (!consumed) {
          res.redirect(
            `${frontendUrl}/cart?error=${encodeURIComponent('Order already submitted.')}`,
          );
          return;
        }
        this.sendLoadingPage(res);
        try {
          const url = await this.handlePendingOrder(consumed, result, frontendUrl);
          res.write(`<script>window.location.href=${JSON.stringify(url)}</script>`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Order creation failed';
          console.error('Pending order creation error:', err);
          const errorUrl = `${frontendUrl}/cart?error=${encodeURIComponent(msg)}`;
          res.write(`<script>window.location.href=${JSON.stringify(errorUrl)}</script>`);
        }
        res.end();
        return;
      }

      // Merge session for non-pending-order flow (if cookie present)
      if (req.sessionId) {
        await this.authService.mergeSessionOnLogin(req.sessionId, result.user.id);
      }

      // No pending order — normal LINE Login, redirect with tokens
      const params = new URLSearchParams({
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        user_id: result.user.id,
        email: result.user.email,
      });
      const successUrl = `${frontendUrl}/auth/callback#${params.toString()}`;
      res.setHeader('Location', successUrl);
      res.status(302).end();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'LINE login failed';
      console.error('LINE callback error:', err);
      const errorUrl = `${frontendUrl}/cart?error=${encodeURIComponent(message)}`;
      res.setHeader('Location', errorUrl);
      res.status(302).end();
    }
  }

  /**
   * Check if the LINE user is friends with the Messaging API bot.
   * Uses the long-lived bot channel access token (not the user's LINE Login token)
   * so the check works regardless of LINE Login token expiration.
   * https://developers.line.biz/en/reference/messaging-api/#get-profile
   */
  private async checkLineFriendship(lineUserId: string): Promise<boolean> {
    try {
      const botToken = this.configService.getOrThrow('LINE_CHANNEL_ACCESS_TOKEN');
      const res = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
        headers: { Authorization: `Bearer ${botToken}` },
      });
      if (res.status === 404) return false;
      if (!res.ok) {
        console.error('checkLineFriendship: HTTP', res.status);
        return false;
      }
      return true;
    } catch (err) {
      console.error('checkLineFriendship error:', err);
      return false;
    }
  }

  /**
   * Send an HTML loading page immediately so the browser shows a spinner
   * instead of a blank screen while the backend processes the order.
   * After processing, the caller writes a `<script>` redirect and calls res.end().
   */
  private sendLoadingPage(res: Response) {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.write(`<!DOCTYPE html>
<html lang="zh">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Processing...</title>
<style>
  body{display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;
    background:#f5f0eb;font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#4a3728}
  .wrap{text-align:center}
  .spinner{width:40px;height:40px;margin:0 auto 16px;border:3px solid #e8ddd2;
    border-top-color:#c07545;border-radius:50%;animation:spin .8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  p{font-size:15px;opacity:.8}
</style></head>
<body><div class="wrap"><div class="spinner"></div><p>Processing your order...</p></div></body>
</html>\n`);
    res.flushHeaders();
  }

  /**
   * Server-side order creation after LINE Login with pending form data.
   * Returns the redirect URL (success or error). Does NOT send a response.
   */
  private async handlePendingOrder(
    pending: { session_id: string; form_data: Record<string, unknown> },
    authResult: {
      user: { id: string; email: string };
      access_token: string;
      refresh_token: string;
    },
    frontendUrl: string,
  ): Promise<string> {
    const fd = pending.form_data;

    // Use cart snapshot from pending order if available (session may be lost
    // after LINE OAuth redirect on mobile). Falls back to session-based cart.
    const cartSnapshot = fd._cart_snapshot as
      | { items: any[]; subtotal: number; shipping_fee: number; total: number }
      | undefined;
    const order = await this.orderService.createOrder(
      pending.session_id,
      null,
      {
        customer_name: fd.customerName as string,
        customer_phone: fd.customerPhone as string,
        customer_email: (fd.customerEmail as string) || undefined,
        customer_address: fd.customerAddress as string,
        notes: (fd.notes as string) || undefined,
        payment_method: 'line',
        customer_line_id: (fd.lineId as string) || undefined,
        skip_cart_clear: true,
      },
      cartSnapshot,
    );

    // Assign user to the order and merge session AFTER order creation.
    // mergeSessionOnLogin deletes old sessions which CASCADE-deletes cart_items.
    const supabase = this.supabaseService.getClient();
    await supabase.from('orders').update({ user_id: authResult.user.id }).eq('id', order.id);
    await this.authService.mergeSessionOnLogin(pending.session_id, authResult.user.id);

    // Send LINE messages (best-effort, failures don't block the order)
    try {
      await this.lineService.sendOrderToAdmin(order.id);
      console.log('LINE admin message sent for order', order.id);
    } catch (adminErr) {
      console.error('LINE admin message failed:', adminErr);
    }

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('line_user_id')
        .eq('id', authResult.user.id)
        .single();
      if (profile?.line_user_id) {
        await this.lineService.sendOrderMessage(order.id, profile.line_user_id);
        console.log('LINE customer message sent to', profile.line_user_id);
      } else {
        console.log('LINE customer message skipped: no line_user_id in profile');
      }
    } catch (custErr) {
      // Most common cause: user hasn't added the Messaging API bot as a friend.
      // The bot_prompt=aggressive param in the LINE Login URL should fix this
      // for new users, but existing users may need to manually add the bot.
      console.error('LINE customer message failed:', custErr);
    }

    // Confirm order (clears cart)
    try {
      await this.orderService.confirmOrder(order.id, pending.session_id, authResult.user.id);
    } catch {
      // Non-critical
    }

    // Return success URL with auth tokens in hash fragment
    const tokenParams = new URLSearchParams({
      access_token: authResult.access_token,
      refresh_token: authResult.refresh_token,
    });
    return `${frontendUrl}/checkout/success?order=${order.order_number}#${tokenParams.toString()}`;
  }

  /**
   * Returns pending order details for the frontend pending page to display.
   * Includes cart snapshot and customer form data (strips internal fields).
   */
  @Get('line/pending-order/:id')
  @UseGuards(AuthGuard)
  async getPendingOrder(@Param('id') id: string, @CurrentUser() user: any) {
    const pending = await this.authService.readPendingOrder(id);
    if (!pending) throw new NotFoundException('Pending order not found or expired');

    const fd = pending.form_data;
    if (fd._user_id && fd._user_id !== user.id) {
      throw new UnauthorizedException('Unauthorized');
    }

    // Return cart snapshot + customer info (strip internal auth fields)
    const { _line_user_id, _user_id, _cart_snapshot, ...customerData } = fd;
    return {
      cart: _cart_snapshot || null,
      customer: customerData,
    };
  }

  /**
   * Called from the "pending confirmation" page when the user clicks "送出下訂".
   * Checks friendship, creates order, sends LINE messages.
   */
  @Post('line/confirm-order')
  @UseGuards(AuthGuard)
  async confirmLineOrder(@Body() body: { pendingId: string }, @CurrentUser() user: any) {
    // Read first to validate ownership and get lineUserId
    const pending = await this.authService.readPendingOrder(body.pendingId);
    if (!pending) {
      throw new BadRequestException(
        'Order request expired. Please return to the cart and try again.',
      );
    }

    const fd = pending.form_data;
    if (!fd._user_id || fd._user_id !== user.id) {
      throw new UnauthorizedException('Unauthorized');
    }

    const lineUserId = fd._line_user_id as string;
    if (!lineUserId) {
      throw new BadRequestException('LINE authentication expired. Please try again from the cart.');
    }

    const isFriend = await this.checkLineFriendship(lineUserId);
    if (!isFriend) {
      throw new BadRequestException('not_friend');
    }

    // Atomically delete — acts as a lock against double-click race condition.
    // If null, another request already consumed it → duplicate prevented.
    const consumed = await this.authService.deletePendingOrder(body.pendingId);
    if (!consumed) {
      throw new BadRequestException('Order already submitted.');
    }

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || '';
    const authResult = {
      user: { id: user.id, email: user.email },
      access_token: '',
      refresh_token: '',
    };

    const successUrl = await this.handlePendingOrder(consumed, authResult, frontendUrl);
    const orderMatch = successUrl.match(/order=([^#&]+)/);
    return { success: true, order_number: orderMatch?.[1] || null };
  }

  @Post('line/exchange')
  async exchangeLineCode(@Body() body: { code: string }) {
    const tokens = await this.authService.consumeOneTimeCode(body.code);
    if (!tokens) throw new UnauthorizedException('Invalid or expired code');
    return tokens;
  }
}
