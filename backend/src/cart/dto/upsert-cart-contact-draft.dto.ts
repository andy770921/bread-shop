import { IsOptional, IsString, MaxLength, IsIn } from 'class-validator';

export class UpsertCartContactDraftDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  customerPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(254)
  customerEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  customerAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsIn(['credit_card', 'line_transfer'])
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lineId?: string;
}
