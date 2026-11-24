import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NonProductionGuard } from './non-production.guard';

describe('NonProductionGuard', () => {
  const guardFor = (nodeEnv: string | undefined) =>
    new NonProductionGuard({ get: () => nodeEnv } as unknown as ConfigService);

  it.each(['development', 'test', undefined])(
    'allows requests when NODE_ENV=%s',
    (env) => {
      expect(guardFor(env).canActivate()).toBe(true);
    },
  );

  it('hides the routes with 404 when NODE_ENV=production', () => {
    expect(() => guardFor('production').canActivate()).toThrow(
      NotFoundException,
    );
  });
});
