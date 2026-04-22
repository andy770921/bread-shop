import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateUploadUrlDto {
  @IsString() filename!: string;
  @IsString() contentType!: string;
  @IsOptional() @IsInt() productId?: number;
}
