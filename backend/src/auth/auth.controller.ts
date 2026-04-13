import {
  Body,
  Controller,
  Get,
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
      // Create a session if none exists (this is a POST, so middleware should have created one)
      throw new UnauthorizedException('No session');
    }
    const pendingId = await this.authService.storePendingOrder(sessionId, body.form_data);
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
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    if (!frontendUrl) {
      res.status(500).json({ error: 'FRONTEND_URL not set' });
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

      // Consume pending order BEFORE handleLineLogin.
      // handleLineLogin calls signInWithPassword() which used to contaminate
      // the Supabase client's auth context on warm Lambda instances.
      // persistSession:false now prevents this, but we keep the order as defense-in-depth.
      let pending: { session_id: string; form_data: Record<string, unknown> } | null = null;
      if (pendingId) {
        pending = await this.authService.consumePendingOrder(pendingId);
        console.log('lineCallback: consumePendingOrder result =', pending ? 'found' : 'null');
      }

      // LINE Login: exchange code, create/sign-in user
      const result = await this.authService.handleLineLogin(code, backendOrigin);

      // If there's a pending order, stream a loading page, then process + redirect.
      // The browser renders the spinner immediately instead of showing a blank page.
      if (pending) {
        this.sendLoadingPage(res);
        try {
          const url = await this.handlePendingOrder(pending, result, frontendUrl);
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

    // Create order with null userId — cart items are linked to the session,
    // and getSessionIds(sessionId, null) looks up by session_id only.
    const order = await this.orderService.createOrder(pending.session_id, null, {
      customer_name: fd.customerName as string,
      customer_phone: fd.customerPhone as string,
      customer_email: (fd.customerEmail as string) || undefined,
      customer_address: fd.customerAddress as string,
      notes: (fd.notes as string) || undefined,
      payment_method: 'line',
      customer_line_id: (fd.lineId as string) || undefined,
      skip_cart_clear: true,
    });

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

  @Post('line/exchange')
  async exchangeLineCode(@Body() body: { code: string }) {
    const tokens = await this.authService.consumeOneTimeCode(body.code);
    if (!tokens) throw new UnauthorizedException('Invalid or expired code');
    return tokens;
  }
}
