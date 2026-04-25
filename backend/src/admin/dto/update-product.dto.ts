import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ProductSpecDto {
  @IsString() label_key!: string;
  @IsString() value_zh!: string;
  @IsString() value_en!: string;
}

export class UpdateProductDto {
  @IsOptional() @IsString() name_zh?: string;
  @IsOptional() @IsString() name_en?: string;
  @IsOptional() @IsString() description_zh?: string;
  @IsOptional() @IsString() description_en?: string;
  @IsOptional() @IsString() @MaxLength(2000) ingredients_zh?: string;
  @IsOptional() @IsString() @MaxLength(2000) ingredients_en?: string;
  @IsOptional() @IsInt() @Min(0) price?: number;
  @IsOptional() @IsInt() category_id?: number;
  @IsOptional() @IsString() image_url?: string;
  @IsOptional() @IsIn(['hot', 'new', 'seasonal']) badge_type?: 'hot' | 'new' | 'seasonal' | null;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductSpecDto)
  specs?: ProductSpecDto[];
  @IsOptional() @IsBoolean() is_active?: boolean;
  @IsOptional() @IsInt() sort_order?: number;
}
