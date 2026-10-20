import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY, Role } from '../decorators/roles.decorator';

function contextForRole(role?: string): ExecutionContext {
  const request = { user: role ? { id: 'u1', role } : undefined };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function guardWithRoles(roles: (Role | string)[] | undefined): RolesGuard {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(roles),
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('allows the request when no roles are required', () => {
    const guard = guardWithRoles(undefined);
    expect(guard.canActivate(contextForRole('EVENT_GOER'))).toBe(true);
  });

  it('rejects a non-admin calling an admin-only route', () => {
    const guard = guardWithRoles([Role.ADMIN]);
    expect(guard.canActivate(contextForRole('EVENT_GOER'))).toBe(false);
  });

  it('allows an admin through an admin-only route', () => {
    const guard = guardWithRoles([Role.ADMIN]);
    expect(guard.canActivate(contextForRole('ADMIN'))).toBe(true);
  });

  it('rejects a request with no authenticated user', () => {
    const guard = guardWithRoles([Role.ADMIN]);
    expect(guard.canActivate(contextForRole(undefined))).toBe(false);
  });

  it('reads required roles from the ROLES_KEY metadata', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([Role.ORGANIZER]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    guard.canActivate(contextForRole('ORGANIZER'));

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      ROLES_KEY,
      expect.any(Array),
    );
  });
});
