import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';
import type { PickupMethod } from '@repo/shared';

export class CreateOrderDto {
  @ApiProperty({ example: '周小明' })
  @IsString()
  customer_name: string;

  @ApiProperty({ example: '0912345678' })
  @IsString()
  customer_phone: string;

  @ApiPropertyOptional({ example: 'user@example.com' })
  @IsOptional()
  @IsEmail()
  customer_email?: string;

  @ApiProperty({ example: '台北市信義區信義路五段7號' })
  @IsString()
  customer_address: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ enum: ['line'] })
  @IsIn(['line'])
  payment_method: 'line';

  @ApiPropertyOptional({
    example: '@john123',
    description: 'Customer LINE ID handle for admin contact',
  })
  @IsOptional()
  @IsString()
  customer_line_id?: string;

  @ApiPropertyOptional({
    description: 'Skip clearing cart (for LINE flow where cart is cleared after confirmation)',
  })
  @IsOptional()
  @IsBoolean()
  skip_cart_clear?: boolean;

  @ApiProperty({ enum: ['in_person', 'seven_eleven_frozen'] })
  @IsIn(['in_person', 'seven_eleven_frozen'])
  pickup_method: PickupMethod;

  @ApiProperty({ example: '07a54160-795d-4943-8338-1be861253ecb' })
  @IsUUID()
  pickup_location_id: string;

  @ApiProperty({ example: '2026-05-10T15:00:00+08:00' })
  @IsISO8601()
  pickup_at: string;
}
