/**
 * DEPRECATED: Use common/decorators/roles.decorator instead.
 * This file is kept for backwards compatibility during transition.
 * All new code should import from common/decorators/roles.decorator.
 */
import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../users/enums/user-role.enum';

export const ROLES_KEY = 'roles';

/**
 * @deprecated Use common/decorators/Roles instead
 * This maintains backwards compatibility by wrapping the canonical implementation
 */
export const Roles = (...roles: UserRole[]) => {
  // Map UserRole to common Role enum for compatibility
  const commonRoleMap: Record<UserRole, string> = {
    [UserRole.ADMIN]: 'admin',
    [UserRole.ORGANIZER]: 'organizer',
    [UserRole.SPONSOR]: 'sponsor',
    [UserRole.EVENT_GOER]: 'attendee',
  };
  const mappedRoles = roles.map(r => commonRoleMap[r]);
  return SetMetadata(ROLES_KEY, mappedRoles);
};
