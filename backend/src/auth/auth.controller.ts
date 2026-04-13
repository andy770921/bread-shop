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

    const lineAuthUrl = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${channelId}&redirect_uri=${redirectUri}&state=${encodeURIComponent(state)}&scope=profile%20openid`;
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

      // LINE Login: exchange code, create/sign-in user
      const result = await this.authService.handleLineLogin(code, backendOrigin);

      // If there's a pending order, create it server-side and redirect to success
      if (pendingId) {
        const pending = await this.authService.consumePendingOrder(pendingId);
        console.log('lineCallback: consumePendingOrder result =', pending ? 'found' : 'null');
        if (pending) {
          // Merge the original cart session with the new user (req.sessionId is
          // unavailable here — the callback is a direct request to the backend
          // domain, so the frontend's session_id cookie is not sent)
          await this.authService.mergeSessionOnLogin(pending.session_id, result.user.id);
          return this.handlePendingOrder(pending, result, frontendUrl, res);
        }
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
   * Server-side order creation after LINE Login with pending form data.
   */
  private async handlePendingOrder(
    pending: { session_id: string; form_data: Record<string, unknown> },
    authResult: { user: { id: string; email: string }; access_token: string },
    frontendUrl: string,
    res: Response,
  ) {
    const fd = pending.form_data;

    try {
      // Create the order
      const order = await this.orderService.createOrder(pending.session_id, authResult.user.id, {
        customer_name: fd.customerName as string,
        customer_phone: fd.customerPhone as string,
        customer_email: (fd.customerEmail as string) || undefined,
        customer_address: fd.customerAddress as string,
        notes: (fd.notes as string) || undefined,
        payment_method: 'line',
        customer_line_id: (fd.lineId as string) || undefined,
        skip_cart_clear: true,
      });

      // Send LINE message (best-effort)
      try {
        await this.lineService.sendOrderToAdmin(order.id);
        // Send to customer if profile has line_user_id
        const supabase = this.supabaseService.getClient();
        const { data: profile } = await supabase
          .from('profiles')
          .select('line_user_id')
          .eq('id', authResult.user.id)
          .single();
        if (profile?.line_user_id) {
          await this.lineService.sendOrderMessage(order.id, profile.line_user_id);
        }
      } catch (lineErr) {
        console.error('LINE message send failed (non-critical):', lineErr);
      }

      // Confirm order (clears cart)
      try {
        await this.orderService.confirmOrder(order.id, pending.session_id, authResult.user.id);
      } catch {
        // Non-critical
      }

      // Redirect to success page
      const successUrl = `${frontendUrl}/checkout/success?order=${order.order_number}`;
      res.setHeader('Location', successUrl);
      res.status(302).end();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Order creation failed';
      console.error('Pending order creation error:', err);
      const errorUrl = `${frontendUrl}/cart?error=${encodeURIComponent(message)}`;
      res.setHeader('Location', errorUrl);
      res.status(302).end();
    }
  }

  @Post('line/exchange')
  async exchangeLineCode(@Body() body: { code: string }) {
    const tokens = await this.authService.consumeOneTimeCode(body.code);
    if (!tokens) throw new UnauthorizedException('Invalid or expired code');
    return tokens;
  }
}
