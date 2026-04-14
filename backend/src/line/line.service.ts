import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { messagingApi } from '@line/bot-sdk';
import { OrderService } from '../order/order.service';

@Injectable()
export class LineService {
  private messagingClient: messagingApi.MessagingApiClient;

  constructor(
    private configService: ConfigService,
    private orderService: OrderService,
  ) {
    this.messagingClient = new messagingApi.MessagingApiClient({
      channelAccessToken: this.configService.getOrThrow('LINE_CHANNEL_ACCESS_TOKEN'),
    });
  }

  async sendOrderToAdmin(orderId: number): Promise<void> {
    const adminUserId = this.configService.get('LINE_ADMIN_USER_ID');
    if (!adminUserId) {
      throw new BadRequestException('LINE_ADMIN_USER_ID is not configured');
    }

    const order = await this.orderService.getOrderWithItems(orderId);
    const flexMessage = this.buildOrderFlexMessage(order);

    await this.messagingClient.pushMessage({
      to: adminUserId,
      messages: [flexMessage],
    });
  }

  async sendOrderMessage(orderId: number, lineUserId: string): Promise<void> {
    const order = await this.orderService.getOrderWithItems(orderId);
    await this.orderService.attachLineUserId(orderId, lineUserId);
    const flexMessage = this.buildOrderFlexMessage(order);

    await this.messagingClient.pushMessage({
      to: lineUserId,
      messages: [flexMessage],
    });
  }

  /**
   * LINE docs: Get profile returns 404 when the target user isn't a friend of the
   * official account, has blocked it, or their account no longer exists. Push
   * messages are not reliable for this check because LINE may still return 200.
   */
  async canPushToUser(lineUserId: string): Promise<boolean> {
    try {
      const botToken = this.configService.getOrThrow('LINE_CHANNEL_ACCESS_TOKEN');
      const res = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
        headers: { Authorization: `Bearer ${botToken}` },
      });

      if (res.status === 404) {
        return false;
      }

      if (!res.ok) {
        console.error('canPushToUser: HTTP', res.status);
        return false;
      }

      return true;
    } catch (err) {
      console.error('canPushToUser error:', err);
      return false;
    }
  }

  private buildOrderFlexMessage(order: any): any {
    const itemContents = order.items.map((item: any) => ({
      type: 'box',
      layout: 'horizontal',
      contents: [
        {
          type: 'text',
          text: `${item.product_name_zh} x ${item.quantity}`,
          size: 'sm',
          color: '#6F645A',
          flex: 3,
        },
        {
          type: 'text',
          text: `NT$${item.subtotal}`,
          size: 'sm',
          color: '#1A110B',
          align: 'end',
          flex: 1,
        },
      ],
    }));

    return {
      type: 'flex',
      altText: `Order ${order.order_number}`,
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
              text: `Order ${order.order_number}`,
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
            { type: 'separator', margin: 'lg' },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'lg',
              contents: [
                { type: 'text', text: 'Subtotal', size: 'sm', color: '#6F645A' },
                {
                  type: 'text',
                  text: `NT$${order.subtotal}`,
                  size: 'sm',
                  align: 'end',
                },
              ],
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: 'Shipping', size: 'sm', color: '#6F645A' },
                {
                  type: 'text',
                  text: `NT$${order.shipping_fee}`,
                  size: 'sm',
                  align: 'end',
                },
              ],
            },
            { type: 'separator', margin: 'md' },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'md',
              contents: [
                { type: 'text', text: 'Total', weight: 'bold', size: 'md' },
                {
                  type: 'text',
                  text: `NT$${order.total}`,
                  weight: 'bold',
                  size: 'md',
                  align: 'end',
                  color: '#C07545',
                },
              ],
            },
            { type: 'separator', margin: 'lg' },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              contents: [
                {
                  type: 'text',
                  text: `Name: ${order.customer_name}`,
                  size: 'xs',
                  color: '#6F645A',
                },
                {
                  type: 'text',
                  text: `Phone: ${order.customer_phone}`,
                  size: 'xs',
                  color: '#6F645A',
                },
                {
                  type: 'text',
                  text: `Address: ${order.customer_address}`,
                  size: 'xs',
                  color: '#6F645A',
                  wrap: true,
                },
                ...(order.customer_line_id
                  ? [
                      {
                        type: 'text' as const,
                        text: `LINE ID: ${order.customer_line_id}`,
                        size: 'xs' as const,
                        color: '#06C755',
                        wrap: true,
                      },
                    ]
                  : []),
                ...(order.notes
                  ? [
                      {
                        type: 'text' as const,
                        text: `Notes: ${order.notes}`,
                        size: 'xs' as const,
                        color: '#6F645A',
                        wrap: true,
                      },
                    ]
                  : []),
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
              text: 'We will process your order shortly!',
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
