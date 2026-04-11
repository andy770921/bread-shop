import { Controller, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { LineService } from './line.service';
import { OptionalAuthGuard } from '../auth/guards/optional-auth.guard';
import { SupabaseService } from '../supabase/supabase.service';

@ApiTags('LINE')
@Controller('api/orders')
export class LineController {
  constructor(
    private lineService: LineService,
    private supabaseService: SupabaseService,
  ) {}

  @Post(':id/line-send')
  @UseGuards(OptionalAuthGuard)
  async sendViaLine(@Param('id', ParseIntPipe) orderId: number, @Req() req: Request) {
    // Always send order details to shop admin
    try {
      await this.lineService.sendOrderToAdmin(orderId);
    } catch (error: any) {
      return {
        success: false,
        message: error?.message || 'Failed to send order via LINE',
      };
    }

    // Also send confirmation to customer if logged in with LINE linked
    const user = req.user;
    if (user) {
      const supabase = this.supabaseService.getClient();
      const { data: profile } = await supabase
        .from('profiles')
        .select('line_user_id')
        .eq('id', user.id)
        .single();

      if (profile?.line_user_id) {
        try {
          await this.lineService.sendOrderMessage(orderId, profile.line_user_id);
        } catch {
          // Customer notification is best-effort; admin push already succeeded
        }
      }
    }

    return { success: true, message: 'Order sent via LINE.' };
  }
}
