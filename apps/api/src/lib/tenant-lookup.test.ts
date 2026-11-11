import { describe, expect, it } from 'vitest';
import { parseRecallWebhookCorrelation } from './tenant-lookup.js';

const TENANT_A = '00000000-0000-0000-0000-000000000010';
const MEETING_A = '00000000-0000-0000-0000-0000000000aa';

describe('parseRecallWebhookCorrelation', () => {
  it('reads bot id and metadata tenant/meeting ids', () => {
    const parsed = parseRecallWebhookCorrelation({
      event: 'bot.done',
      data: {
        bot: {
          id: 'bot-acme-1',
          metadata: { tenant_id: TENANT_A, meeting_id: MEETING_A },
        },
      },
    });
    expect(parsed).toEqual({
      recallBotId: 'bot-acme-1',
      claimedTenantId: TENANT_A,
      claimedMeetingId: MEETING_A,
      event: 'bot.done',
    });
  });

  it('accepts internal_meeting_id as a meeting correlation alias', () => {
    const parsed = parseRecallWebhookCorrelation({
      event: 'bot.status_change',
      data: {
        bot: {
          id: 'bot-acme-1',
          metadata: { internal_meeting_id: MEETING_A },
        },
      },
    });
    expect(parsed.claimedMeetingId).toBe(MEETING_A);
    expect(parsed.claimedTenantId).toBeNull();
  });

  it('ignores non-uuid claimed ids', () => {
    const parsed = parseRecallWebhookCorrelation({
      event: 'bot.done',
      data: { bot: { id: 'bot-x', metadata: { tenant_id: 'not-a-uuid', meeting_id: 'nope' } } },
    });
    expect(parsed.claimedTenantId).toBeNull();
    expect(parsed.claimedMeetingId).toBeNull();
    expect(parsed.recallBotId).toBe('bot-x');
  });
});
