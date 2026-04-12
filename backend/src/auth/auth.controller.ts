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
import { AuthService } from './auth.service';
import { AuthGuard } from './guards/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SupabaseService } from '../supabase/supabase.service';

@ApiTags('Auth')
@Controller('api/auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private supabaseService: SupabaseService,
    private configService: ConfigService,
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

  @Get('line')
  async lineLogin(@Req() req: Request, @Res() res: Response) {
    const channelId = this.configService.getOrThrow('LINE_LOGIN_CHANNEL_ID');
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    // Use req.get('host') — NOT X-Forwarded-Host — to get the backend's actual host.
    // The redirect_uri must match what's registered in LINE Developer Console (backend URLs).
    const host = req.get('host');
    const redirectUri = encodeURIComponent(`${protocol}://${host}/api/auth/line/callback`);
    const state = randomUUID();
    const lineAuthUrl = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${channelId}&redirect_uri=${redirectUri}&state=${state}&scope=profile%20openid`;
    res.redirect(lineAuthUrl);
  }

  @Get('line/callback')
  async lineCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // Diagnose env vars on every call (visible in Vercel Function Logs)
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    const hasChannelId = !!this.configService.get('LINE_LOGIN_CHANNEL_ID');
    const hasChannelSecret = !!this.configService.get('LINE_LOGIN_CHANNEL_SECRET');
    console.log('LINE callback: env check', {
      FRONTEND_URL: frontendUrl ?? 'NOT SET',
      LINE_LOGIN_CHANNEL_ID: hasChannelId,
      LINE_LOGIN_CHANNEL_SECRET: hasChannelSecret,
      host: req.get('host'),
      proto: req.headers['x-forwarded-proto'],
      code: code ? `${code.substring(0, 4)}...` : 'MISSING',
    });

    if (!frontendUrl) {
      console.error('LINE callback: FRONTEND_URL is not set');
      res.status(500).json({
        error: 'Server misconfiguration',
        detail: 'FRONTEND_URL environment variable is not set',
      });
      return;
    }

    try {
      const protocol = req.headers['x-forwarded-proto'] || req.protocol;
      // Use req.get('host') — NOT X-Forwarded-Host — to match the redirect_uri
      // sent in GET /api/auth/line (must be identical for LINE token exchange)
      const host = req.get('host');
      const backendOrigin = `${protocol}://${host}`;
      console.log('LINE callback: exchanging code with backendOrigin =', backendOrigin);

      const result = await this.authService.handleLineLogin(code, backendOrigin);
      console.log('LINE callback: handleLineLogin succeeded, userId =', result.user.id);

      if (req.sessionId) {
        await this.authService.mergeSessionOnLogin(req.sessionId, result.user.id);
      }

      // Pass tokens via URL hash fragment — serverless-safe (no in-memory state).
      // Hash fragments are never sent to servers (RFC 3986), same pattern as OAuth implicit flow.
      const params = new URLSearchParams({
        access_token: result.access_token,
        refresh_token: result.refresh_token,
        user_id: result.user.id,
        email: result.user.email,
      });
      res.redirect(`${frontendUrl}/auth/callback#${params.toString()}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'LINE login failed';
      console.error('LINE callback error:', err);
      res.redirect(`${frontendUrl}/auth/callback#error=${encodeURIComponent(message)}`);
    }
  }

  @Post('line/exchange')
  async exchangeLineCode(@Body() body: { code: string }) {
    const tokens = await this.authService.consumeOneTimeCode(body.code);
    if (!tokens) throw new UnauthorizedException('Invalid or expired code');
    return tokens;
  }
}
