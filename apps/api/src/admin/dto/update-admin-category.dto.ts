import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateAdminCategoryDto {
  @Transform(({ value }: { value: string }) => value.trim())
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;
}
