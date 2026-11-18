import { describe, it, expect } from 'vitest';
import {
  ROLES,
  hasRole,
  isOrganizerOrAdmin,
  normalizeRole,
} from '@/lib/auth/roles';

describe('normalizeRole (#1617)', () => {
  it('maps backend-shaped uppercase roles to canonical values', () => {
    expect(normalizeRole('EVENT_GOER')).toBe(ROLES.ATTENDEE);
    expect(normalizeRole('ORGANIZER')).toBe(ROLES.ORGANIZER);
    expect(normalizeRole('SPONSOR')).toBe(ROLES.SPONSOR);
    expect(normalizeRole('ADMIN')).toBe(ROLES.ADMIN);
  });

  it('still accepts legacy lowercase roles and surrounding whitespace', () => {
    expect(normalizeRole('organizer')).toBe(ROLES.ORGANIZER);
    expect(normalizeRole(' attendee ')).toBe(ROLES.ATTENDEE);
    expect(normalizeRole('Admin')).toBe(ROLES.ADMIN);
  });

  it('returns null for missing or unknown roles', () => {
    expect(normalizeRole(undefined)).toBeNull();
    expect(normalizeRole('')).toBeNull();
    expect(normalizeRole('superuser')).toBeNull();
  });
});

describe('hasRole (#1617)', () => {
  it('matches regardless of the casing the backend uses', () => {
    expect(hasRole('ORGANIZER', ROLES.ORGANIZER, ROLES.ADMIN)).toBe(true);
    expect(hasRole('ADMIN', ROLES.ADMIN)).toBe(true);
    expect(hasRole('EVENT_GOER', ROLES.ADMIN)).toBe(false);
    expect(hasRole(null, ROLES.ADMIN)).toBe(false);
  });

  it('admits organizers and admins to organizer pages', () => {
    expect(isOrganizerOrAdmin('ORGANIZER')).toBe(true);
    expect(isOrganizerOrAdmin('ADMIN')).toBe(true);
    expect(isOrganizerOrAdmin('EVENT_GOER')).toBe(false);
    expect(isOrganizerOrAdmin('SPONSOR')).toBe(false);
  });
});
