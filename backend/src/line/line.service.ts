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
      channelAccessToken: this.configService.getOrThrow(
        'LINE_CHANNEL_ACCESS_TOKEN',
      ),
    });
  }

  async sendOrderMessage(orderId: number, lineUserId: string): Promise<void> {
    const supabase = this.supabaseService.getClient();

    const { data: order } = await supabase
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('id', orderId)
      .single();

    if (!order) throw new BadRequestException('Order not found');

    await supabase
      .from('orders')
      .update({ line_user_id: lineUserId })
      .eq('id', orderId);

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
