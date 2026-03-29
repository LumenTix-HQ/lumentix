import { BruteForceService } from './brute-force.service';

describe('BruteForceService', () => {
  let service: BruteForceService;
  const redisMock = {
    incr: jest.fn(),
    expire: jest.fn(),
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  };
  const configServiceMock = {
    get: jest.fn().mockImplementation((key: string, defaultValue: number) => {
      if (key === 'MAX_ATTEMPTS') return 3;
      if (key === 'WINDOW_SECONDS') return 900;
      if (key === 'LOCK_SECONDS') return 3600;
      return defaultValue;
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BruteForceService(redisMock as any, configServiceMock as any);
  });

  it('locks IP after max attempts', async () => {
    redisMock.incr.mockResolvedValueOnce(1);
    redisMock.expire.mockResolvedValueOnce(1);
    await service.recordFailedAttempt('1.2.3.4');

    redisMock.incr.mockResolvedValueOnce(3);
    redisMock.set.mockResolvedValueOnce('OK');
    await service.recordFailedAttempt('1.2.3.4');

    expect(redisMock.set).toHaveBeenCalledWith(
      'bruteforce:locked:1.2.3.4',
      '1',
      'EX',
      3600,
    );
  });

  it('returns true when IP is locked', async () => {
    redisMock.get.mockResolvedValueOnce('1');
    await expect(service.isLocked('1.2.3.4')).resolves.toBe(true);
  });

  it('returns false when IP is not locked', async () => {
    redisMock.get.mockResolvedValueOnce(null);
    await expect(service.isLocked('1.2.3.4')).resolves.toBe(false);
  });

  it('resets attempts on success', async () => {
    redisMock.del.mockResolvedValueOnce(1);
    await service.reset('1.2.3.4');
    expect(redisMock.del).toHaveBeenCalledWith('bruteforce:attempts:1.2.3.4');
  });

  it('unlocks IP immediately', async () => {
    redisMock.del.mockResolvedValueOnce(1);
    await service.unlock('1.2.3.4');
    expect(redisMock.del).toHaveBeenCalledWith(
      'bruteforce:locked:1.2.3.4',
      'bruteforce:attempts:1.2.3.4',
    );
  });
});
