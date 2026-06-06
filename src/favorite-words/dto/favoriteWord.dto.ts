import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateFavoriteWordDto {
  @IsString()
  @IsNotEmpty()
  hanzi!: string;

  @IsString()
  @IsOptional()
  pinyin?: string;

  @IsString()
  @IsOptional()
  sv?: string;

  @IsString()
  @IsOptional()
  vi?: string;
}
