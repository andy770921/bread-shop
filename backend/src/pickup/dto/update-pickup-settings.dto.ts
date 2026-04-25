import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class UpdatePickupSettingsDto {
  @ApiProperty({
    example: ['15:00', '15:30', '20:00'],
    description: 'Allowed pickup time slots in HH:mm (15:00–22:00, 30-minute increments)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(15)
  @IsString({ each: true })
  @Matches(/^((1[5-9]|2[01]):(00|30)|22:00)$/, { each: true })
  timeSlots: string[];

  @ApiProperty({ example: 30 })
  @IsInt()
  @Min(1)
  @Max(365)
  windowDays: number;

  @ApiProperty({ example: 2, description: 'Lead days before earliest pickup (0 = today)' })
  @IsInt()
  @Min(0)
  @Max(30)
  leadDays: number;

  @ApiProperty({ example: [0], description: 'Weekday ints to close (0=Sun..6=Sat)' })
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  disabledWeekdays: number[];

  @ApiPropertyOptional({ example: '2026-05-10' })
  @IsOptional()
  @IsDateString()
  closureStartDate: string | null;

  @ApiPropertyOptional({ example: '2026-05-14' })
  @IsOptional()
  @IsDateString()
  closureEndDate: string | null;
}
