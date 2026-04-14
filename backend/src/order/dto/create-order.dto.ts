import type { CartResponse } from '@repo/shared';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsObject, IsOptional, IsString } from 'class-validator';

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

  @ApiPropertyOptional({
    description:
      'Checkout cart snapshot captured on the client at submit time. The backend canonicalizes product data and totals before creating the order.',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  cart_snapshot?: Partial<CartResponse>;
}
