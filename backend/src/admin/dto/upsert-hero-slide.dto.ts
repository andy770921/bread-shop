import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { HERO_SLIDE_TEXT_SIZES, type HeroSlideTextSize } from '@repo/shared';

const TEXT_SIZE_VALUES = HERO_SLIDE_TEXT_SIZES as unknown as string[];

export class UpsertHeroSlideDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title_zh?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title_en?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  subtitle_zh?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  subtitle_en?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  image_url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_published?: boolean;

  @ApiPropertyOptional({ enum: HERO_SLIDE_TEXT_SIZES })
  @IsOptional()
  @IsString()
  @IsIn(TEXT_SIZE_VALUES)
  title_size?: HeroSlideTextSize;

  @ApiPropertyOptional({ enum: HERO_SLIDE_TEXT_SIZES })
  @IsOptional()
  @IsString()
  @IsIn(TEXT_SIZE_VALUES)
  subtitle_size?: HeroSlideTextSize;
}
