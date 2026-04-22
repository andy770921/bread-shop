import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';

@Injectable()
export class UploadAdminService {
  constructor(
    private supabase: SupabaseService,
    private config: ConfigService,
  ) {}

  async createSignedUploadUrl(input: CreateUploadUrlDto) {
    const supabase = this.supabase.getClient();
    const bucket = this.config.get<string>('SUPABASE_STORAGE_BUCKET', 'product-images');
    const ext = (input.filename.split('.').pop() || 'jpg').toLowerCase();
    const ts = Date.now();
    const path = input.productId
      ? `products/${input.productId}-${ts}.${ext}`
      : `products/draft-${ts}.${ext}`;

    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
    if (error || !data) throw new BadRequestException(error?.message ?? 'Failed to sign URL');

    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
    return {
      uploadUrl: data.signedUrl,
      path,
      token: data.token,
      publicUrl: pub.publicUrl,
    };
  }
}
