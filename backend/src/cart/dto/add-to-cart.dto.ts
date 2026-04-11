import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive, Max } from 'class-validator';

export class AddToCartDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @IsPositive()
  product_id: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  @IsPositive()
  @Max(99)
  quantity: number;
}
