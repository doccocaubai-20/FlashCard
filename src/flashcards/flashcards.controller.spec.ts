import { Test, TestingModule } from '@nestjs/testing';
import { FlashcardsController } from './flashcards.controller';
import { FlashcardsService } from './flashcards.service';

describe('FlashcardsController', () => {
  let controller: FlashcardsController;

  beforeEach(async () => {
    // Placeholder mock object for dependency injection - to be populated as test scenarios are added
    const mockFlashcardsService = {};

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FlashcardsController],
      providers: [
        { provide: FlashcardsService, useValue: mockFlashcardsService },
      ],
    }).compile();

    controller = module.get<FlashcardsController>(FlashcardsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
