import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

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

  @ApiProperty({ enum: ['lemon_squeezy', 'line'] })
  @IsIn(['lemon_squeezy', 'line'])
  payment_method: 'lemon_squeezy' | 'line';

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
}
