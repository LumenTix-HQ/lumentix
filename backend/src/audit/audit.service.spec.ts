import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  let service: AuditService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: 'AuditLogRepository',
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            findOneBy: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

it(
  'filters by action',
  async () => {
    await service.findLogs({
      action: 'LOGIN',
      page: 1,
      limit: 20,
    });

    expect(
      queryBuilder.andWhere,
    ).toHaveBeenCalledWith(
      'audit.action = :action',
      { action: 'LOGIN' },
    );
  },
);

it(
  'prunes old audit logs',
  async () => {
    jest
      .spyOn(
        auditService,
        'pruneLogs',
      )
      .mockResolvedValue(15);

    await task.pruneOldLogs();

    expect(
      auditService.pruneLogs,
    ).toHaveBeenCalled();
  },
);