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
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SupabaseService } from '../supabase/supabase.service';
import { OrderService } from '../order/order.service';
import { CheckoutService } from '../checkout/checkout.service';
import { LineService } from '../line/line.service';
import { InventoryService } from '../shop-settings/inventory.service';

type LineStartResponse =
  | { pendingId: string; next: 'line_login' }
  | { pendingId: string; next: 'confirm' }
  | { pendingId: string; next: 'not_friend'; add_friend_url: string };

@ApiTags('Auth')
@Controller('api/auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private supabaseService: SupabaseService,
    private configService: ConfigService,
    private orderService: OrderService,
    private checkoutService: CheckoutService,
    private lineService: LineService,
    private inventory: InventoryService,
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

  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refresh_token);
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

  @Get('line/message-eligibility')
  @UseGuards(AuthGuard)
  async getLineMessageEligibility(@CurrentUser() user: any) {
    const lineOaId = this.configService.get('LINE_OA_ID', '@papabakery');
    const addFriendUrl = `https://line.me/R/ti/p/${lineOaId}`;
    const { data: profile } = await this.supabaseService
      .getClient()
      .from('profiles')
      .select('line_user_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.line_user_id) {
      return {
        can_receive_messages: false,
        add_friend_url: addFriendUrl,
      };
    }

    return {
      can_receive_messages: await this.lineService.canPushToUser(profile.line_user_id),
      add_friend_url: addFriendUrl,
    };
  }

  /**
   * Create a checkout draft before any LINE checkout flow.
   * The response tells the frontend whether it should redirect to LINE login,
   * stop because the OA is not reachable, or confirm the order immediately.
   */
  @Post('line/start')
  async lineStart(
    @Req() req: Request,
    @Body() body: { form_data: Record<string, unknown> },
  ): Promise<LineStartResponse> {
    const sessionId = req.sessionId;
    if (!sessionId) {
      throw new UnauthorizedException('No session');
    }
    let currentUserId: string | null = null;
    let lineUserId: string | null = null;
    const authHeader = req.headers.authorization;
    const supabase = this.supabaseService.getClient();
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token);

      if (error || !user) {
        throw new UnauthorizedException('Login expired. Please sign in again.');
      }

      currentUserId = user.id;

      const { data: profile } = await supabase
        .from('profiles')
        .select('line_user_id')
        .eq('id', user.id)
        .maybeSingle();

      lineUserId = profile?.line_user_id || null;
    }
    // Strip _ prefixed fields from client data to prevent injection of internal fields
    const safeFormData = Object.fromEntries(
      Object.entries(body.form_data).filter(([k]) => !k.startsWith('_')),
    );
    // Snapshot the cart now — session cookies may be lost during LINE OAuth redirect
    // on mobile (LINE in-app browser, Safari ITP). The snapshot is used for:
    // 1. Displaying order details on the pending confirmation page
    // 2. Fallback for order creation if the session cart is empty after redirect
    const cart = await this.orderService.getCheckoutCartSnapshot(
      sessionId,
      currentUserId || undefined,
    );

    // Defensive inventory check before LINE OAuth redirect.
    // The same guard runs again at order-create time inside `OrderService.createOrder`
    // (race-safe), but failing here avoids sending the customer through the LINE login
    // round-trip just to be told the date is full when they come back.
    const pickupAt = (safeFormData as Record<string, unknown>).pickup_at;
    if (typeof pickupAt === 'string' && cart.items.length > 0) {
      const totalQuantity = cart.items.reduce((sum, item) => sum + item.quantity, 0);
      await this.inventory.assertHasCapacity(new Date(pickupAt), totalQuantity);
    }
    const pendingFormData: Record<string, unknown> = {
      ...safeFormData,
      _cart_snapshot: cart,
    };
    if (currentUserId && lineUserId) {
      pendingFormData._user_id = currentUserId;
      pendingFormData._line_user_id = lineUserId;
    } else if (currentUserId) {
      pendingFormData._link_user_id = currentUserId;
    }
    const pendingId = await this.authService.storePendingOrder(sessionId, pendingFormData);
    if (!lineUserId) {
      return { pendingId, next: 'line_login' };
    }

    const lineOaId = this.configService.get('LINE_OA_ID', '@papabakery');
    const addFriendUrl = `https://line.me/R/ti/p/${lineOaId}`;
    const canReceiveMessages = await this.lineService.canPushToUser(lineUserId);
    if (!canReceiveMessages) {
      return { pendingId, next: 'not_friend', add_friend_url: addFriendUrl };
    }

    return { pendingId, next: 'confirm' };
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

      const linkToUserId =
        pending && typeof pending.form_data._link_user_id === 'string'
          ? (pending.form_data._link_user_id as string)
          : undefined;

      // LINE Login: exchange code, create/sign-in user
      const result = await this.authService.handleLineLogin(code, backendOrigin, linkToUserId);

      if (pending && pendingId) {
        const canReceiveMessages = await this.lineService.canPushToUser(result.lineUserId);
        console.log('lineCallback: friendship status =', canReceiveMessages);

        if (!canReceiveMessages) {
          // User is NOT friends with the bot. Store auth data in the pending order
          // so the confirm-order endpoint can use it later, then redirect to the
          // "pending confirmation" page where user can add the bot and retry.
          await this.authService.updatePendingOrderAuth(pendingId, {
            lineUserId: result.lineUserId,
            userId: result.user.id,
          });
          const pendingUrl = this.withAuthHash(
            `${frontendUrl}/checkout/pending?pendingId=${pendingId}`,
            result,
          );
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
          const url = await this.checkoutService.completePendingLineCheckout({
            pending: consumed,
            authResult: result,
            frontendUrl,
          });
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
    const cartSnapshot = fd._cart_snapshot || null;
    const customerData = { ...fd };
    delete customerData._line_user_id;
    delete customerData._link_user_id;
    delete customerData._user_id;
    delete customerData._cart_snapshot;
    return {
      cart: cartSnapshot,
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

    const canReceiveMessages = await this.lineService.canPushToUser(lineUserId);
    if (!canReceiveMessages) {
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

    const successUrl = await this.checkoutService.completePendingLineCheckout({
      pending: consumed,
      authResult,
      frontendUrl,
    });
    const orderMatch = successUrl.match(/order=([^#&]+)/);
    return { success: true, order_number: orderMatch?.[1] || null };
  }

  @Post('line/exchange')
  async exchangeLineCode(@Body() body: { code: string }) {
    const tokens = await this.authService.consumeOneTimeCode(body.code);
    if (!tokens) throw new UnauthorizedException('Invalid or expired code');
    return tokens;
  }

  private withAuthHash(
    url: string,
    auth: { access_token?: string; refresh_token?: string },
  ): string {
    if (!auth.access_token) {
      return url;
    }

    const tokenParams = new URLSearchParams({ access_token: auth.access_token });
    if (auth.refresh_token) {
      tokenParams.set('refresh_token', auth.refresh_token);
    }

    return `${url}#${tokenParams.toString()}`;
  }
}
