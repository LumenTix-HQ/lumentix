/**
 * Canonical frontend roles.
 *
 * The NestJS API issues uppercase enum values (`EVENT_GOER`, `ORGANIZER`,
 * `SPONSOR`, `ADMIN`), while older frontend code compares lowercase strings.
 * Everything goes through normalizeRole()/hasRole() so both spellings work.
 */

export const ROLES = {
  ATTENDEE: 'attendee',
  ORGANIZER: 'organizer',
  SPONSOR: 'sponsor',
  ADMIN: 'admin',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

const ALIASES: Record<string, Role> = {
  attendee: ROLES.ATTENDEE,
  event_goer: ROLES.ATTENDEE,
  'event-goer': ROLES.ATTENDEE,
  user: ROLES.ATTENDEE,
  organizer: ROLES.ORGANIZER,
  sponsor: ROLES.SPONSOR,
  admin: ROLES.ADMIN,
  administrator: ROLES.ADMIN,
};

/** Lowercases and maps a backend/cookie role claim to a canonical Role. */
export function normalizeRole(role: string | null | undefined): Role | null {
  if (!role) return null;
  const key = role.trim().toLowerCase();
  return ALIASES[key] ?? null;
}

/** True when `role` normalizes to one of `allowed`. */
export function hasRole(
  role: string | null | undefined,
  ...allowed: Role[]
): boolean {
  const normalized = normalizeRole(role);
  return normalized !== null && allowed.includes(normalized);
}

/** Organizer-only pages also admit platform admins. */
export function isOrganizerOrAdmin(role: string | null | undefined): boolean {
  return hasRole(role, ROLES.ORGANIZER, ROLES.ADMIN);
}
