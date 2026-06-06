import { Test, TestingModule } from '@nestjs/testing';
import { FlashcardsService } from './flashcards.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('FlashcardsService', () => {
  let service: FlashcardsService;

  beforeEach(async () => {
    // Placeholder mock object for dependency injection - to be populated as test scenarios are added
    const mockPrismaService = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlashcardsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<FlashcardsService>(FlashcardsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
