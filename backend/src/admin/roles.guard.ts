/**
 * DEPRECATED: Use common/guards/roles.guard instead.
 * This file is kept for backwards compatibility during transition.
 * All new code should import from common/guards/roles.guard.
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

/**
 * @deprecated Use common/guards/RolesGuard instead
 * This maintains backwards compatibility by delegating to the canonical implementation
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @Roles() decorator — route is not role-restricted
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      return false;
    }

    // Map UserRole to common role strings for comparison
    const userRole = this.mapUserRoleToCommonRole(user.role);
    return requiredRoles.some((role) => role === userRole);
  }

  private mapUserRoleToCommonRole(userRole: string): string {
    const roleMap: Record<string, string> = {
      'ADMIN': 'admin',
      'ORGANIZER': 'organizer',
      'SPONSOR': 'sponsor',
      'EVENT_GOER': 'attendee',
    };
    return roleMap[userRole] || userRole;
  }
}
