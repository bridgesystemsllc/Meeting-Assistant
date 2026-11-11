import { describe, it, expect } from 'vitest';
import {
  InviteRequestSchema,
  countSeatsUsed,
  seatLimitReached,
  SeatsResponseSchema,
} from './tenant.js';

describe('seat math', () => {
  it('counts active/invited memberships plus extra pending invites', () => {
    expect(countSeatsUsed({ membershipSeats: 3, extraPendingInvites: 1 })).toBe(4);
  });

  it('treats the limit as reached when used + additional would exceed it', () => {
    expect(seatLimitReached(10, 10)).toBe(true);
    expect(seatLimitReached(9, 10)).toBe(false);
    expect(seatLimitReached(9, 10, 2)).toBe(true);
  });

  it('never reports used above the limit after a rejected invite', () => {
    const used = countSeatsUsed({ membershipSeats: 10, extraPendingInvites: 0 });
    expect(seatLimitReached(used, 10)).toBe(true);
    expect(used).toBe(10);
  });
});

describe('InviteRequestSchema', () => {
  it('lowercases and trims email', () => {
    const parsed = InviteRequestSchema.parse({ email: '  Jordan@Example.com ', role: 'member' });
    expect(parsed.email).toBe('jordan@example.com');
  });

  it('defaults role to member', () => {
    const parsed = InviteRequestSchema.parse({ email: 'jordan@example.com' });
    expect(parsed.role).toBe('member');
  });
});

describe('SeatsResponseSchema', () => {
  it('accepts a seats payload with no price fields', () => {
    const parsed = SeatsResponseSchema.parse({
      seat_limit: 10,
      seats_used: 4,
      members: [],
      invites: [],
    });
    expect(parsed.seat_limit).toBe(10);
    expect(JSON.stringify(parsed)).not.toMatch(/\$\s?\d/);
  });
});
