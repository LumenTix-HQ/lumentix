import { Test, TestingModule } from '@nestjs/testing';
import { SponsorsController } from './sponsors.controller';
import { SponsorsService } from './sponsors.service';
import { ContributionsService } from './contributions.service';

describe('SponsorsController', () => {
  let controller: SponsorsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SponsorsController],
      providers: [
        { provide: SponsorsService, useValue: {} },
        { provide: ContributionsService, useValue: {} },
      ],
    }).compile();

    controller = module.get<SponsorsController>(SponsorsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
