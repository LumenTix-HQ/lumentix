import { SetMetadata } from '@nestjs/common';

/**
 * Role enum used throughout the application.
 * Canonical roles that map to UserRole from users/enums/user-role.enum.ts
 */
export enum Role {
  ORGANIZER = 'organizer',
  ATTENDEE = 'attendee',
  SPONSOR = 'sponsor',
  ADMIN = 'admin',
}

export const ROLES_KEY = 'roles';

/**
 * Decorator to restrict access to routes by role.
 * Can accept both Role enum values and UserRole strings (normalized internally).
 * 
 * Usage:
 *   @Roles(Role.ADMIN)
 *   @Roles(Role.ORGANIZER, Role.SPONSOR)
 */
export const Roles = (...roles: (Role | string)[]) => {
  // Normalize all roles to lowercase common format
  const normalizedRoles = roles.map(r => {
    if (typeof r === 'string') {
      // Handle UserRole enum values (ADMIN, ORGANIZER, etc.) by converting to common format
      const userRoleMap: Record<string, string> = {
        'ADMIN': Role.ADMIN,
        'ORGANIZER': Role.ORGANIZER,
        'SPONSOR': Role.SPONSOR,
        'EVENT_GOER': Role.ATTENDEE,
      };
      return userRoleMap[r] || r.toLowerCase();
    }
    return r;
  });
  return SetMetadata(ROLES_KEY, normalizedRoles);
};
