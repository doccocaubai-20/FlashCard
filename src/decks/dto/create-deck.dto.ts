import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateDeckDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  language?: string;
}
