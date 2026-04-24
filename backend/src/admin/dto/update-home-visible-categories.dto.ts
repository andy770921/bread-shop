import { ArrayMinSize, ArrayNotEmpty, IsArray, IsInt } from 'class-validator';

export class UpdateHomeVisibleCategoriesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  category_ids!: number[];
}
