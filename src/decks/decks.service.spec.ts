import { Test, TestingModule } from '@nestjs/testing';
import { DecksService } from './decks.service';
import { PrismaService } from 'src/prisma/prisma.service';

describe('DecksService', () => {
  let service: DecksService;

  beforeEach(async () => {
    // Placeholder mock object for dependency injection - to be populated as test scenarios are added
    const mockPrismaService = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DecksService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<DecksService>(DecksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
