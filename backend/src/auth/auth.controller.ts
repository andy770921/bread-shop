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
    const host = req.headers['x-forwarded-host'] || req.get('host');
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
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const backendOrigin = `${protocol}://${host}`;
    const result = await this.authService.handleLineLogin(code, backendOrigin);

    if (req.sessionId) {
      await this.authService.mergeSessionOnLogin(req.sessionId, result.user.id);
    }

    const oneTimeCode = randomUUID();
    await this.authService.storeOneTimeCode(oneTimeCode, result);

    const frontendUrl = this.configService.getOrThrow('FRONTEND_URL');
    res.redirect(`${frontendUrl}/auth/callback?code=${oneTimeCode}`);
  }

  @Post('line/exchange')
  async exchangeLineCode(@Body() body: { code: string }) {
    const tokens = await this.authService.consumeOneTimeCode(body.code);
    if (!tokens) throw new UnauthorizedException('Invalid or expired code');
    return tokens;
  }
}
