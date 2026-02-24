import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { ExecutionContext } from '@nestjs/common';

function mockContext(role: UserRole | null): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { role } : null }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('allows admin through', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.ADMIN]);

    expect(guard.canActivate(mockContext(UserRole.ADMIN))).toBe(true);
  });

  it('rejects non-admin with ForbiddenException', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.ADMIN]);

    expect(() => guard.canActivate(mockContext(UserRole.EVENT_GOER))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects unauthenticated user', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([UserRole.ADMIN]);

    expect(() => guard.canActivate(mockContext(null))).toThrow(
      ForbiddenException,
    );
  });

  it('allows through when no roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);

    expect(guard.canActivate(mockContext(UserRole.EVENT_GOER))).toBe(true);
  });
});
