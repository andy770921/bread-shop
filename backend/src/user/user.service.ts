import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class UserService {
  constructor(private supabaseService: SupabaseService) {}

  async getProfile(userId: string) {
    const supabase = this.supabaseService.getClient();

    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();

    const {
      data: { user },
    } = await supabase.auth.admin.getUserById(userId);

    return {
      id: userId,
      email: user?.email || '',
      name: data?.name || null,
      phone: data?.phone || null,
      preferred_language: data?.preferred_language || 'zh',
    };
  }

  async updateProfile(
    userId: string,
    updates: { name?: string; phone?: string; preferred_language?: string },
  ) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;

    return data;
  }
}
