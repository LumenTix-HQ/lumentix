import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { SponsorsController } from './sponsors.controller';
import { SponsorsService } from './sponsors.service';
import { ContributionsService } from './contributions.service';
import { IdempotencyInterceptor } from '../common/interceptors/idempotency.interceptor';

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

  it('distributeEscrow() should have IdempotencyInterceptor', () => {
    const reflector = new Reflector();
    const interceptors = reflector.get(
      '__interceptors__',
      controller.distributeEscrow,
    );
    expect(interceptors).toContain(IdempotencyInterceptor);
  });
});
