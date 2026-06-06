import { Test, TestingModule } from '@nestjs/testing';
import { DecksController } from './decks.controller';
import { DecksService } from './decks.service';

describe('DecksController', () => {
  let controller: DecksController;

  beforeEach(async () => {
    // Placeholder mock object for dependency injection - to be populated as test scenarios are added
    const mockDecksService = {};

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DecksController],
      providers: [{ provide: DecksService, useValue: mockDecksService }],
    }).compile();

    controller = module.get<DecksController>(DecksController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
