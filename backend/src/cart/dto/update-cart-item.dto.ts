import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive, Max } from 'class-validator';

export class UpdateCartItemDto {
  @ApiProperty({ example: 2 })
  @IsInt()
  @IsPositive()
  @Max(99)
  quantity: number;
}
