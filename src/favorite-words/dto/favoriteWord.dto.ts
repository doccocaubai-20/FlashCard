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

  @IsString()
  @IsOptional()
  exampleHanzi?: string;

  @IsString()
  @IsOptional()
  examplePinyin?: string;

  @IsString()
  @IsOptional()
  exampleMeaning?: string;
}

