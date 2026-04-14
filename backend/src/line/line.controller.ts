import { Controller, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { LineService } from './line.service';
import { OptionalAuthGuard } from '../auth/guards/optional-auth.guard';
import { SupabaseService } from '../supabase/supabase.service';

@ApiTags('LINE')
@Controller('api/orders')
export class LineController {
  constructor(
    private lineService: LineService,
    private supabaseService: SupabaseService,
    private configService: ConfigService,
  ) {}

  @Post(':id/line-send')
  @UseGuards(OptionalAuthGuard)
  async sendViaLine(@Param('id', ParseIntPipe) orderId: number, @Req() req: Request) {
    const lineOaId = this.configService.get('LINE_OA_ID', '@papabakery');
    const addFriendUrl = `https://line.me/R/ti/p/${lineOaId}`;
    const user = req.user;
    const missingFriendResponse = {
      success: false,
      needs_friend: true,
      add_friend_url: addFriendUrl,
      message: 'Please add our LINE Official Account as a friend first.',
    };

    if (!user) {
      return {
        success: false,
        message: 'LINE login required.',
      };
    }

    const supabase = this.supabaseService.getClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('line_user_id')
      .eq('id', user.id)
      .single();

    if (!profile?.line_user_id) {
      return {
        success: false,
        message: 'LINE account is not linked.',
      };
    }

    const canPushToCustomer = await this.lineService.canPushToUser(profile.line_user_id);
    if (!canPushToCustomer) {
      return missingFriendResponse;
    }

    // Always send order details to shop admin
    try {
      await this.lineService.sendOrderToAdmin(orderId);
    } catch (error: any) {
      // LINE API 400 = recipient hasn't added the bot as friend
      if (error?.statusCode === 400) {
        return missingFriendResponse;
      }
      return {
        success: false,
        message: error?.message || 'Failed to send order via LINE',
      };
    }

    try {
      await this.lineService.sendOrderMessage(orderId, profile.line_user_id);
    } catch {
      return {
        success: false,
        message: 'Failed to send order via LINE',
      };
    }

    return { success: true, message: 'Order sent via LINE.' };
  }
}
