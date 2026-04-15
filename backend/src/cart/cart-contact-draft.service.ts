import { CartContactDraft } from '@repo/shared';
import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UpsertCartContactDraftDto } from './dto/upsert-cart-contact-draft.dto';

@Injectable()
export class CartContactDraftService {
  private static readonly DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

  constructor(private supabaseService: SupabaseService) {}

  async getForSession(sessionId: string): Promise<CartContactDraft | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('checkout_contact_drafts')
      .select('*')
      .eq('session_id', sessionId)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return this.mapToResponse(data);
  }

  async upsertForSession(
    sessionId: string,
    userId: string | undefined,
    dto: UpsertCartContactDraftDto,
  ): Promise<CartContactDraft> {
    const expiresAt = new Date(Date.now() + CartContactDraftService.DRAFT_TTL_MS).toISOString();

    const record = {
      session_id: sessionId,
      user_id: userId ?? null,
      customer_name: this.normalizeField(dto.customerName),
      customer_phone: this.normalizeField(dto.customerPhone),
      customer_email: this.normalizeField(dto.customerEmail),
      customer_address: this.normalizeField(dto.customerAddress),
      notes: this.normalizeField(dto.notes),
      payment_method: dto.paymentMethod ?? null,
      line_id: this.normalizeField(dto.lineId),
      expires_at: expiresAt,
    };

    const { data, error } = await this.supabaseService
      .getClient()
      .from('checkout_contact_drafts')
      .upsert(record, { onConflict: 'session_id' })
      .select()
      .single();

    if (error) throw error;

    return this.mapToResponse(data);
  }

  async clearForSession(sessionId: string): Promise<void> {
    const { error } = await this.supabaseService
      .getClient()
      .from('checkout_contact_drafts')
      .delete()
      .eq('session_id', sessionId);

    if (error) throw error;
  }

  private normalizeField(value: string | undefined): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private mapToResponse(row: any): CartContactDraft {
    return {
      customerName: row.customer_name ?? '',
      customerPhone: row.customer_phone ?? '',
      customerEmail: row.customer_email ?? '',
      customerAddress: row.customer_address ?? '',
      notes: row.notes ?? '',
      paymentMethod: row.payment_method ?? undefined,
      lineId: row.line_id ?? '',
    };
  }
}
