import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: '周小明' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '0912345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ enum: ['zh', 'en'] })
  @IsOptional()
  @IsIn(['zh', 'en'])
  preferred_language?: 'zh' | 'en';
}
