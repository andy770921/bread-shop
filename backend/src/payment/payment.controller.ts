import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { PaymentService } from './payment.service';
import { OptionalAuthGuard } from '../auth/guards/optional-auth.guard';

@ApiTags('Payment')
@Controller('api')
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  @Post('payments/checkout')
  @UseGuards(OptionalAuthGuard)
  async createCheckout(@Body() body: { order_id: number }, @Req() req: Request) {
    const checkoutUrl = await this.paymentService.createCheckout(
      body.order_id,
      req.sessionId,
      req.user?.id,
    );
    return { checkout_url: checkoutUrl };
  }

  @Post('webhooks/lemon-squeezy')
  async handleWebhook(@Req() req: RawBodyRequest<Request>) {
    const signature = req.headers['x-signature'] as string;
    await this.paymentService.handleWebhook(req.rawBody!, signature);
    return { received: true };
  }
}
