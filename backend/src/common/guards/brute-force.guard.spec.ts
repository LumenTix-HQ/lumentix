import { ExecutionContext } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { BruteForceGuard } from './brute-force.guard';

describe('BruteForceGuard', () => {
  let guard: BruteForceGuard;
  const bruteForceServiceMock = {
    isLocked: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new BruteForceGuard(bruteForceServiceMock as any);
  });

  it('denies request when IP is locked', async () => {
    bruteForceServiceMock.isLocked.mockResolvedValueOnce(true);

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ ip: '1.2.3.4' }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toThrow(
      ThrottlerException,
    );
  });

  it('allows request when IP is not locked', async () => {
    bruteForceServiceMock.isLocked.mockResolvedValueOnce(false);

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ ip: '1.2.3.4' }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
