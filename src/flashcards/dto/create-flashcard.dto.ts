import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateFlashcardDto {
  @IsInt()
  @IsNotEmpty()
  deckId!: number;

  @IsString()
  @IsNotEmpty()
  hanzi!: string;

  @IsString()
  @IsNotEmpty()
  pinyin!: string;

  @IsString()
  @IsNotEmpty()
  meaning!: string;

  @IsString()
  @IsOptional()
  radicals?: string;

  @IsString()
  @IsOptional()
  strokeData?: string;

  @IsString()
  @IsOptional()
  audioUrl?: string;

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
