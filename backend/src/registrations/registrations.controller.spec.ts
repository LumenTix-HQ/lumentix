import { Test, TestingModule } from '@nestjs/testing';
import { RegistrationsController } from './registrations.controller';
import { RegistrationsService } from './registrations.service';

describe('RegistrationsController', () => {
  let controller: RegistrationsController;

  const mockRegistrationsService = {
    register: jest.fn(),
    listForEvent: jest.fn(),
    listForUser: jest.fn(),
    cancel: jest.fn(),
    cancelWithRefund: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RegistrationsController],
      providers: [
        {
          provide: RegistrationsService,
          useValue: mockRegistrationsService,
        },
      ],
    }).compile();

    controller = module.get(RegistrationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('register() calls service.register with correct params', async () => {
    const response = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    mockRegistrationsService.register.mockResolvedValue({
      httpStatus: 201,
      registration: { id: 'reg-1' },
    });

    await controller.register(
      'event-1',
      { user: { id: 'user-1' } } as any,
      response as any,
    );

    expect(mockRegistrationsService.register).toHaveBeenCalledWith(
      'event-1',
      'user-1',
    );
  });

  it('listForEvent() calls service.listForEvent', () => {
    const dto = { page: 1, limit: 20 };

    controller.listForEvent(
      'event-1',
      dto as any,
      { user: { id: 'user-1' } } as any,
    );

    expect(mockRegistrationsService.listForEvent).toHaveBeenCalledWith(
      'event-1',
      'user-1',
      dto,
    );
  });

  it('listForUser() calls service.listForUser', () => {
    const dto = { page: 2, limit: 10 };

    controller.listForUser(dto as any, { user: { id: 'user-1' } } as any);

    expect(mockRegistrationsService.listForUser).toHaveBeenCalledWith(
      'user-1',
      dto,
    );
  });

  it('cancel() calls service.cancel', () => {
    controller.cancel('reg-1', { user: { id: 'user-1' } } as any);

    expect(mockRegistrationsService.cancel).toHaveBeenCalledWith(
      'reg-1',
      'user-1',
    );
  });

  it('adminCancel() calls service.cancelWithRefund', () => {
    controller.adminCancel(
      'event-1',
      'reg-1',
      { user: { id: 'user-1' } } as any,
    );

    expect(mockRegistrationsService.cancelWithRefund).toHaveBeenCalledWith(
      'event-1',
      'reg-1',
      'user-1',
    );
  });
});
