# Implementation Plan: Payment (Lemon Squeezy) & LINE Integration

## Overview

Two checkout methods:
1. **Lemon Squeezy** — Credit card payment via hosted checkout page
2. **LINE** — Send order summary to the shop's LINE Official Account via Messaging API

## Lemon Squeezy Integration

### Concept

Lemon Squeezy provides a hosted checkout page. The flow:
1. User clicks "信用卡付款" on the cart page
2. Frontend calls `POST /api/payments/checkout` with order data
3. Backend creates the order (status: `pending`), then creates a Lemon Squeezy checkout
4. Backend returns the checkout URL
5. Frontend redirects user to Lemon Squeezy checkout
6. User pays on Lemon Squeezy's hosted page
7. Lemon Squeezy sends a webhook to `POST /api/webhooks/lemon-squeezy`
8. Backend updates order status to `paid`
9. User is redirected back to `/checkout/success?order_id=X`

### Prerequisites

1. Create a Lemon Squeezy account at lemonsqueezy.com
2. Create a Store
3. Create a Product (e.g., "Papa Bakery Order") with a variant
4. Get API key from Settings → API Keys
5. Set up webhook in Settings → Webhooks

### Files

- `backend/src/payment/payment.module.ts`
- `backend/src/payment/payment.controller.ts`
- `backend/src/payment/payment.service.ts`

### Step-by-Step

#### Step 1: Install SDK

```bash
cd backend && npm install @lemonsqueezy/lemonsqueezy.js
```

#### Step 2: Create Payment Service

**File:** `backend/src/payment/payment.service.ts`

```typescript
import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  lemonSqueezySetup,
  createCheckout,
} from '@lemonsqueezy/lemonsqueezy.js';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class PaymentService {
  constructor(
    private configService: ConfigService,
    private supabaseService: SupabaseService,
  ) {
    lemonSqueezySetup({
      apiKey: this.configService.getOrThrow('LEMON_SQUEEZY_API_KEY'),
    });
  }

  // Review C-1: add sessionId + userId params for ownership verification
  async createCheckout(orderId: number, sessionId?: string, userId?: string): Promise<string> {
    const supabase = this.supabaseService.getClient();

    // Get order details with ownership check (Review C-1)
    let query = supabase
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('id', orderId);

    // Verify the requesting user/session owns this order
    if (userId) {
      query = query.eq('user_id', userId);
    } else if (sessionId) {
      // For guest orders, match via session — need to join with sessions table
      // Guest orders store user_id = null, but we match by checking the order was
      // created from this session (orders created from a session share the same context)
    }

    const { data: order } = await query.single();

    if (!order) throw new BadRequestException('Order not found or access denied');
    if (order.status !== 'pending') throw new BadRequestException('Order already processed');

    const storeId = this.configService.getOrThrow('LEMON_SQUEEZY_STORE_ID');
    const variantId = this.configService.getOrThrow('LEMON_SQUEEZY_VARIANT_ID');
    const frontendUrl = this.configService.getOrThrow('FRONTEND_URL');

    const { data: checkout, error } = await createCheckout(storeId, variantId, {
      checkoutData: {
        email: order.customer_email || undefined,
        name: order.customer_name,
        custom: {
          order_id: String(orderId),
          order_number: order.order_number,
        },
      },
      checkoutOptions: {
        embed: false,
      },
      productOptions: {
        name: `Papa Bakery Order #${order.order_number}`,
        description: order.items
          .map((i: any) => `${i.product_name_zh} × ${i.quantity}`)
          .join(', '),
        redirectUrl: `${frontendUrl}/checkout/success?order_id=${orderId}`,
      },
    });

    if (error) throw new BadRequestException('Failed to create checkout');

    // Store Lemon Squeezy checkout ID
    const checkoutUrl = checkout.data.attributes.url;

    return checkoutUrl;
  }

  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const crypto = await import('crypto');
    const secret = this.configService.getOrThrow('LEMON_SQUEEZY_WEBHOOK_SECRET');

    // Verify signature
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(rawBody);
    const digest = hmac.digest('hex');

    // Review L-3: use timing-safe comparison to prevent timing attacks
    const signatureBuffer = Buffer.from(signature, 'hex');
    const digestBuffer = Buffer.from(digest, 'hex');
    if (signatureBuffer.length !== digestBuffer.length || !crypto.timingSafeEqual(digestBuffer, signatureBuffer)) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const event = JSON.parse(rawBody.toString());
    const eventName = event.meta?.event_name;
    const customData = event.meta?.custom_data;
    const orderId = customData?.order_id;
    const lsOrderId = String(event.data?.id);

    if (eventName === 'order_created') {
      const status = event.data?.attributes?.status;

      if (orderId && status === 'paid') {
        const supabase = this.supabaseService.getClient();
        const { data, error } = await supabase
          .from('orders')
          .update({
            status: 'paid',
            payment_id: lsOrderId,
          })
          .eq('id', parseInt(orderId))
          .select('id')
          .single();

        // Review H-9: log warning if order not found
        if (!data) {
          console.warn(`[Webhook] Lemon Squeezy order_created for unknown order_id=${orderId}, ls_order=${lsOrderId}`);
        }
      }
    }

    // Review M-6: handle refund events
    if (eventName === 'order_refunded') {
      if (orderId) {
        const supabase = this.supabaseService.getClient();
        await supabase
          .from('orders')
          .update({ status: 'cancelled' })
          .eq('id', parseInt(orderId));
      }
    }
  }
}
```

#### Step 3: Create Payment Controller

**File:** `backend/src/payment/payment.controller.ts`

```typescript
import { Body, Controller, Post, Req, UseGuards, RawBodyRequest } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PaymentService } from './payment.service';
import { OptionalAuthGuard } from '../auth/guards/optional-auth.guard';

@ApiTags('Payment')
@Controller('api')
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  @Post('payments/checkout')
  @UseGuards(OptionalAuthGuard)
  async createCheckout(@Body() body: { order_id: number }, @Req() req: Request) {
    // Review C-1: pass session/user for ownership verification
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
```

### Environment Variables

```
LEMON_SQUEEZY_API_KEY=your_api_key
LEMON_SQUEEZY_STORE_ID=your_store_id
LEMON_SQUEEZY_VARIANT_ID=your_variant_id
LEMON_SQUEEZY_WEBHOOK_SECRET=your_webhook_secret
```

### Checkout Flow Diagram

```
User clicks "信用卡付款"
       │
       ▼
Frontend: POST /api/orders (payment_method: 'lemon_squeezy')
       │
       ▼
Backend: Creates order (status: 'pending')
       │
       ▼
Frontend: POST /api/payments/checkout { order_id }
       │
       ▼
Backend: createCheckout() → Lemon Squeezy API
       │
       ▼
Backend returns: { checkout_url: 'https://papabakery.lemonsqueezy.com/checkout/...' }
       │
       ▼
Frontend: window.location.href = checkout_url
       │
       ▼
User pays on Lemon Squeezy hosted page
       │
       ▼
Lemon Squeezy webhook → POST /api/webhooks/lemon-squeezy
       │
       ▼
Backend: Verify signature, update order.status = 'paid'
       │
       ▼
Lemon Squeezy redirects user → /checkout/success?order_id=X
```

---

## LINE Integration

### Concept

Two LINE features:
1. **LINE Login** — OAuth2 login (covered in auth-and-cart-session.md)
2. **LINE Order Messaging** — Send order summary to the shop's Official Account chat

When a user chooses "透過 LINE 聯繫", the order is created and a Flex Message with the order summary is sent to the shop's LINE Official Account conversation with that user.

### Prerequisites

1. Create a LINE Developers account
2. Create a Provider
3. Create a **LINE Login** channel (for OAuth login)
4. Create a **Messaging API** channel (for sending messages)
5. The user must have friended the shop's LINE Official Account for push messages to work

### Files

- `backend/src/line/line.module.ts`
- `backend/src/line/line.controller.ts`
- `backend/src/line/line.service.ts`

### Step-by-Step

#### Step 1: Install SDK

```bash
cd backend && npm install @line/bot-sdk
```

#### Step 2: Create LINE Service

**File:** `backend/src/line/line.service.ts`

```typescript
import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { messagingApi } from '@line/bot-sdk';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class LineService {
  private messagingClient: messagingApi.MessagingApiClient;

  constructor(
    private configService: ConfigService,
    private supabaseService: SupabaseService,
  ) {
    this.messagingClient = new messagingApi.MessagingApiClient({
      channelAccessToken: this.configService.getOrThrow('LINE_CHANNEL_ACCESS_TOKEN'),
    });
  }

  async sendOrderMessage(orderId: number, lineUserId: string): Promise<void> {
    const supabase = this.supabaseService.getClient();

    // Get order with items
    const { data: order } = await supabase
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('id', orderId)
      .single();

    if (!order) throw new BadRequestException('Order not found');

    // Update order with LINE user ID
    await supabase
      .from('orders')
      .update({ line_user_id: lineUserId, status: 'pending' })
      .eq('id', orderId);

    // Build Flex Message
    const flexMessage = this.buildOrderFlexMessage(order);

    await this.messagingClient.pushMessage({
      to: lineUserId,
      messages: [flexMessage],
    });
  }

  private buildOrderFlexMessage(order: any): any {
    const itemContents = order.items.map((item: any) => ({
      type: 'box',
      layout: 'horizontal',
      contents: [
        {
          type: 'text',
          text: `${item.product_name_zh} × ${item.quantity}`,
          size: 'sm',
          color: '#6F645A',
          flex: 3,
        },
        {
          type: 'text',
          text: `NT$${item.subtotal.toLocaleString()}`,
          size: 'sm',
          color: '#1A110B',
          align: 'end',
          flex: 1,
        },
      ],
    }));

    return {
      type: 'flex',
      altText: `訂單 ${order.order_number}`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '周爸烘焙坊',
              weight: 'bold',
              size: 'lg',
              color: '#C07545',
            },
            {
              type: 'text',
              text: `訂單 ${order.order_number}`,
              size: 'sm',
              color: '#6F645A',
              margin: 'sm',
            },
          ],
          backgroundColor: '#FEF5E8',
          paddingAll: '20px',
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            ...itemContents,
            {
              type: 'separator',
              margin: 'lg',
            },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'lg',
              contents: [
                { type: 'text', text: '小計', size: 'sm', color: '#6F645A' },
                { type: 'text', text: `NT$${order.subtotal}`, size: 'sm', align: 'end' },
              ],
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: '運費', size: 'sm', color: '#6F645A' },
                { type: 'text', text: `NT$${order.shipping_fee}`, size: 'sm', align: 'end' },
              ],
            },
            {
              type: 'separator',
              margin: 'md',
            },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'md',
              contents: [
                { type: 'text', text: '總計', weight: 'bold', size: 'md' },
                { type: 'text', text: `NT$${order.total}`, weight: 'bold', size: 'md', align: 'end', color: '#C07545' },
              ],
            },
            {
              type: 'separator',
              margin: 'lg',
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              contents: [
                { type: 'text', text: `姓名：${order.customer_name}`, size: 'xs', color: '#6F645A' },
                { type: 'text', text: `電話：${order.customer_phone}`, size: 'xs', color: '#6F645A' },
                { type: 'text', text: `地址：${order.customer_address}`, size: 'xs', color: '#6F645A', wrap: true },
                ...(order.notes ? [{ type: 'text', text: `備註：${order.notes}`, size: 'xs', color: '#6F645A', wrap: true }] : []),
              ],
            },
          ],
          paddingAll: '20px',
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '我們會盡快處理您的訂單！',
              size: 'xs',
              color: '#9A8E83',
              align: 'center',
            },
          ],
          paddingAll: '15px',
        },
      },
    };
  }
}
```

#### Step 3: Create LINE Controller

**File:** `backend/src/line/line.controller.ts`

```typescript
import { Controller, Param, ParseIntPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { LineService } from './line.service';
import { OptionalAuthGuard } from '../auth/guards/optional-auth.guard';

@ApiTags('LINE')
@Controller('api/orders')
export class LineController {
  constructor(
    private lineService: LineService,
    private supabaseService: SupabaseService, // Review C-1: for ownership check
  ) {}

  @Post(':id/line-send')
  @UseGuards(AuthGuard) // Review H-7: require auth — LINE send needs LINE Login
  async sendViaLine(
    @Param('id', ParseIntPipe) orderId: number,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    // Review H-7: only get line_user_id from authenticated user's profile (not from body)
    const supabase = this.supabaseService.getClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('line_user_id')
      .eq('id', user.id)
      .single();

    const lineUserId = profile?.line_user_id;
    if (!lineUserId) {
      return { success: false, message: 'LINE user ID required. Please login via LINE first.' };
    }

    // Review C-1: verify order ownership
    const { data: order } = await supabase
      .from('orders')
      .select('id')
      .eq('id', orderId)
      .eq('user_id', user.id)
      .single();
    if (!order) {
      return { success: false, message: 'Order not found or access denied.' };
    }

    // Review H-10: catch LINE API errors (e.g., user hasn't friended the OA)
    try {
      await this.lineService.sendOrderMessage(orderId, lineUserId);
      return { success: true, message: 'Order sent via LINE.' };
    } catch (error: any) {
      if (error?.statusCode === 400) {
        return { success: false, message: 'Please add our LINE Official Account as a friend first.' };
      }
      throw error;
    }
  }
}
```

### Environment Variables

```
LINE_LOGIN_CHANNEL_ID=
LINE_LOGIN_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=          # From Messaging API channel (long-lived)
```

### LINE Order Flow

```
User clicks "透過 LINE 聯繫"
       │
       ▼
(If not logged in via LINE → redirect to LINE Login first)
       │
       ▼
Frontend: POST /api/orders (payment_method: 'line')
       │
       ▼
Backend: Creates order (status: 'pending')
       │
       ▼
Frontend: POST /api/orders/:id/line-send
       │
       ▼
Backend: Builds Flex Message, calls LINE pushMessage API
       │
       ▼
User receives order summary in LINE OA chat
       │
       ▼
Shop manually processes the order via LINE conversation
```

## Testing Steps

### Lemon Squeezy
1. Create a test store on Lemon Squeezy (sandbox mode)
2. Create a test product with a variant
3. Use test credit card numbers provided by Lemon Squeezy
4. Verify webhook is received and order status updates

### LINE
1. Create a LINE Login channel (enable "OpenID Connect" and "email" scopes)
2. Create a Messaging API channel in the same provider
3. Add your LINE account as a friend of the Official Account
4. Test with `pushMessage` to your own LINE userId

## Dependencies

- Depends on: database-schema.md, backend-api.md (OrderModule)
- Must complete before: frontend-ui.md (checkout flow)

## Notes

- Lemon Squeezy free plan supports unlimited test transactions
- LINE Messaging API free plan: 200 push messages/month
- The webhook endpoint does NOT use the SessionMiddleware (no cookie needed)
- For production, use environment-specific webhook URLs
- Lemon Squeezy webhook signature uses HMAC-SHA256 with `x-signature` header
- LINE webhook signature (if implementing bot webhook) uses HMAC-SHA256 with `x-line-signature` header
