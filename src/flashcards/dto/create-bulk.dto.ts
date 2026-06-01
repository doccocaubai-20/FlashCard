import { IsInt, IsNotEmpty, IsArray, ValidateNested, IsString, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

class FlashcardItemDto {
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

export class CreateBulkFlashcardsDto {
    @IsInt()
    @IsNotEmpty()
    deckId!: number;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => FlashcardItemDto)
    cards!: FlashcardItemDto[];
}