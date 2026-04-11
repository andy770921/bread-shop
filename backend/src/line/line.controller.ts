import {
  Controller,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { LineService } from './line.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SupabaseService } from '../supabase/supabase.service';

@ApiTags('LINE')
@Controller('api/orders')
export class LineController {
  constructor(
    private lineService: LineService,
    private supabaseService: SupabaseService,
  ) {}

  @Post(':id/line-send')
  @UseGuards(AuthGuard)
  async sendViaLine(
    @Param('id', ParseIntPipe) orderId: number,
    @CurrentUser() user: any,
  ) {
    const supabase = this.supabaseService.getClient();

    const { data: profile } = await supabase
      .from('profiles')
      .select('line_user_id')
      .eq('id', user.id)
      .single();

    const lineUserId = profile?.line_user_id;
    if (!lineUserId) {
      return {
        success: false,
        message: 'LINE user ID required. Please login via LINE first.',
      };
    }

    const { data: order } = await supabase
      .from('orders')
      .select('id')
      .eq('id', orderId)
      .eq('user_id', user.id)
      .single();

    if (!order) {
      return {
        success: false,
        message: 'Order not found or access denied.',
      };
    }

    try {
      await this.lineService.sendOrderMessage(orderId, lineUserId);
      return { success: true, message: 'Order sent via LINE.' };
    } catch (error: any) {
      if (error?.statusCode === 400) {
        return {
          success: false,
          message:
            'Please add our LINE Official Account as a friend first.',
        };
      }
      throw error;
    }
  }
}
