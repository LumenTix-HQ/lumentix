import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { AuthController } from '../../auth/auth.controller';
import { AuthService } from '../../auth/auth.service';
import { BruteForceService } from '../services/brute-force.service';
import { BruteForceGuard } from '../guards/brute-force.guard';

/**
 * Integration tests verifying that ThrottlerGuard is wired to auth routes
 * and that the guard metadata is applied correctly.
 */
describe('ThrottlerGuard on auth routes', () => {
  let module: TestingModule;
  let throttlerGuard: ThrottlerGuard;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          {
            name: 'short',
            ttl: 60_000,
            limit: 5,
          },
        ]),
      ],
      controllers: [AuthController],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        {
          provide: AuthService,
          useValue: { login: jest.fn(), register: jest.fn() },
        },
        {
          provide: BruteForceService,
          useValue: { reset: jest.fn(), recordFailedAttempt: jest.fn(), isLocked: jest.fn().mockResolvedValue(false) },
        },
        BruteForceGuard,
      ],
    }).compile();

    throttlerGuard = module.get<ThrottlerGuard>(ThrottlerGuard);
  });

  it('ThrottlerGuard is registered in the module', () => {
    expect(throttlerGuard).toBeDefined();
  });

  it('login route has @Throttle decorator metadata', () => {
    const metadata = Reflect.getMetadata(
      'throttler:throttle',
      AuthController.prototype.login,
    );
    expect(metadata).toBeDefined();
  });

  it('register route has @Throttle decorator metadata', () => {
    const metadata = Reflect.getMetadata(
      'throttler:throttle',
      AuthController.prototype.register,
    );
    expect(metadata).toBeDefined();
  });

  it('ThrottlerGuard allows request when under limit', async () => {
    const mockContext = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({
          ip: '127.0.0.1',
          headers: {},
          method: 'POST',
          url: '/auth/login',
        }),
        getResponse: () => ({
          header: jest.fn(),
        }),
      }),
      getHandler: () => AuthController.prototype.login,
      getClass: () => AuthController,
    } as unknown as ExecutionContext;

    // canActivate should not throw for a fresh IP
    await expect(
      throttlerGuard.canActivate(mockContext),
    ).resolves.not.toThrow();
  });
});
