import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductAdminService {
  constructor(
    private supabase: SupabaseService,
    private config: ConfigService,
  ) {}

  async list() {
    const supabase = this.supabase.getClient();
    const { data, error } = await supabase
      .from('products')
      .select('*, category:categories(id, slug)')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });
    if (error) throw new BadRequestException(error.message);
    return { products: data ?? [] };
  }

  async findOne(id: number) {
    const supabase = this.supabase.getClient();
    const { data, error } = await supabase
      .from('products')
      .select('*, category:categories(id, slug)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Product not found');
    return data;
  }

  async create(dto: CreateProductDto) {
    const supabase = this.supabase.getClient();
    const { data, error } = await supabase.from('products').insert(dto).select().single();
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async update(id: number, dto: UpdateProductDto) {
    const supabase = this.supabase.getClient();

    if (dto.image_url) {
      const { data: existing } = await supabase
        .from('products')
        .select('image_url')
        .eq('id', id)
        .maybeSingle();
      if (existing?.image_url && existing.image_url !== dto.image_url) {
        await this.deleteStorageImage(existing.image_url);
      }
    }

    const { data, error } = await supabase
      .from('products')
      .update(dto)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Product not found');
    return data;
  }

  async hardDelete(id: number) {
    const supabase = this.supabase.getClient();

    const { count } = await supabase
      .from('order_items')
      .select('*', { head: true, count: 'exact' })
      .eq('product_id', id);

    if (count && count > 0) {
      throw new ConflictException(
        'Product is referenced by existing orders. Use soft-delete (is_active=false) instead.',
      );
    }

    const { data: existing } = await supabase
      .from('products')
      .select('image_url')
      .eq('id', id)
      .maybeSingle();
    if (existing?.image_url) {
      await this.deleteStorageImage(existing.image_url);
    }

    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) throw new BadRequestException(error.message);
    return { success: true };
  }

  private async deleteStorageImage(imageUrl: string) {
    try {
      const bucket = this.config.get<string>('SUPABASE_STORAGE_BUCKET', 'product-images');
      const url = new URL(imageUrl);
      const prefix = `/storage/v1/object/public/${bucket}/`;
      const storagePath = url.pathname.startsWith(prefix)
        ? url.pathname.slice(prefix.length)
        : null;
      if (storagePath) {
        await this.supabase.getClient().storage.from(bucket).remove([storagePath]);
      }
    } catch (err) {
      console.warn('Failed to delete old product image:', err);
    }
  }
}
