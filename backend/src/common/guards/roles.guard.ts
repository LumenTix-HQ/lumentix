import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, Role } from '../decorators/roles.decorator';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';

/**
 * Canonical RBAC guard used across all modules.
 * Supports both Role enum and UserRole string values.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<(Role | string)[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const { user } = request;

    if (!user) return false;

    // Normalize user's role for comparison
    const userRole = this.normalizeUserRole(user.role);
    
    // Check if user role matches any of the required roles
    return requiredRoles.some((role) => {
      const normalizedRole = typeof role === 'string' ? role.toLowerCase() : role;
      return userRole === normalizedRole;
    });
  }

  /**
   * Normalize UserRole enum values (ADMIN, ORGANIZER, etc.) to common Role format
   */
  private normalizeUserRole(role: string): string {
    const userRoleMap: Record<string, string> = {
      'ADMIN': Role.ADMIN,
      'ORGANIZER': Role.ORGANIZER,
      'SPONSOR': Role.SPONSOR,
      'EVENT_GOER': Role.ATTENDEE,
    };
    return userRoleMap[role] || role.toLowerCase();
  }
}
