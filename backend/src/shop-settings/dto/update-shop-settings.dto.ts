import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, Max, Min } from 'class-validator';

export class UpdateShopSettingsDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  shippingEnabled: boolean;

  @ApiProperty({ example: 60 })
  @IsInt()
  @Min(0)
  @Max(9999)
  shippingFee: number;

  @ApiProperty({ example: 500 })
  @IsInt()
  @Min(0)
  @Max(999999)
  freeShippingThreshold: number;

  @ApiProperty({ example: true })
  @IsBoolean()
  promoBannerEnabled: boolean;
}
