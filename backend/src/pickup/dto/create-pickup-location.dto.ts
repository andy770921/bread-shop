import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreatePickupLocationDto {
  @ApiProperty({ example: '新竹 - 荷蘭村' })
  @IsString()
  @MinLength(1)
  label_zh: string;

  @ApiProperty({ example: 'Hsinchu - Holland Village' })
  @IsString()
  @MinLength(1)
  label_en: string;
}
