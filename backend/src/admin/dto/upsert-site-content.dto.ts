import { IsOptional, IsString, ValidateIf } from 'class-validator';

export class UpsertSiteContentDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  value_zh?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  value_en?: string | null;
}
