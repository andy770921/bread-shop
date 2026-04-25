import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, Max, Min } from 'class-validator';
import type { InventoryMode } from '@repo/shared';

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

  @ApiProperty({ example: 'unlimited', enum: ['unlimited', 'daily_total'] })
  @IsIn(['unlimited', 'daily_total'])
  inventoryMode: InventoryMode;

  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(1)
  @Max(999)
  dailyTotalLimit: number;
}
