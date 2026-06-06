import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateHistoryDto {
  @IsNotEmpty()
  @IsString()
  hanzi!: string;

  @IsOptional()
  @IsString()
  pinyin?: string;

  @IsOptional()
  @IsString()
  sv?: string;

  @IsOptional()
  @IsString()
  vi?: string;

  @IsOptional()
  @IsString()
  aiExplanation?: string;
}
