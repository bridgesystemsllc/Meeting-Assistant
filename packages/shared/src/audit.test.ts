import { describe, expect, it } from 'vitest';
import {
  ActivityListResponseSchema,
  ActivityQuerySchema,
  AuditActionSchema,
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABELS,
  maskEmail,
  sanitizeAuditMetadata,
} from './audit.js';

describe('AuditActionSchema', () => {
  it('covers auth, invite, membership, meeting.deleted, and reserved later-phase actions', () => {
    expect(AUDIT_ACTIONS).toEqual([
      'login',
      'logout',
      'failed-login',
      'failed-invite',
      'invite.sent',
      'invite.resent',
      'invite.revoked',
      'invite.accepted',
      'member.deactivated',
      'member.reactivated',
      'member.role_changed',
      'branding.updated',
      'meeting.bot_dispatched',
      'meeting.deleted',
    ]);
    for (const action of AUDIT_ACTIONS) {
      expect(AuditActionSchema.parse(action)).toBe(action);
      expect(AUDIT_ACTION_LABELS[action]).toBeTruthy();
    }
  });
});

describe('sanitizeAuditMetadata', () => {
  it('strips tokens, secrets, hashes, and raw email', () => {
    expect(
      sanitizeAuditMetadata({
        email: 'jordan@example.com',
        role: 'member',
        token: 'raw-invite-token',
        token_hash: 'abc123',
        code_verifier: 'pkce',
        password: 'hunter2',
        nested: { access_token: 'nope', email: 'ok@example.com' },
      })
    ).toEqual({
      role: 'member',
      nested: {},
    });
  });
});

describe('maskEmail', () => {
  it('masks as a***@domain', () => {
    expect(maskEmail('jordan@example.com')).toBe('j***@example.com');
    expect(maskEmail('Avery.Owner@Example.COM')).toBe('a***@example.com');
  });
});

describe('ActivityQuerySchema', () => {
  it('caps limit at 100 and accepts an action filter', () => {
    expect(ActivityQuerySchema.parse({}).limit).toBe(20);
    expect(ActivityQuerySchema.parse({ limit: '100', action: 'invite.sent' })).toEqual({
      limit: 100,
      action: 'invite.sent',
    });
    expect(ActivityQuerySchema.parse({ limit: 101 }).limit).toBe(100);
    expect(ActivityQuerySchema.parse({ limit: 0 }).limit).toBe(1);
    expect(() => ActivityQuerySchema.parse({ action: 'not-an-action' })).toThrow();
  });
});

describe('ActivityListResponseSchema', () => {
  it('accepts a cursor page', () => {
    const parsed = ActivityListResponseSchema.parse({
      items: [
        {
          id: '00000000-0000-0000-0000-0000000000aa',
          created_at: '2026-11-10T20:00:00.000Z',
          action: 'invite.sent',
          actor: {
            id: '00000000-0000-0000-0000-000000000011',
            name: 'Avery Owner',
            email: 'owner@example.com',
          },
          target_type: 'invite',
          target_id: '00000000-0000-0000-0000-0000000000bb',
          metadata: { email: 'jordan@example.com' },
        },
      ],
      nextCursor: 'cursor-1',
    });
    expect(parsed.items[0].action).toBe('invite.sent');
    expect(parsed.nextCursor).toBe('cursor-1');
  });
});
