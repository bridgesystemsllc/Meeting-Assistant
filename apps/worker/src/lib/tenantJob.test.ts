import { describe, expect, it, vi, beforeEach } from 'vitest';

const { withTenant } = vi.hoisted(() => ({
  withTenant: vi.fn(),
}));

vi.mock('./db.js', () => ({
  withTenant,
}));

import { readJobTenantId, runTenantJob, TenantJobError } from './tenantJob.js';

describe('readJobTenantId', () => {
  it('reads tenantId from the job payload', () => {
    expect(readJobTenantId({ tenantId: '00000000-0000-0000-0000-000000000010' })).toBe(
      '00000000-0000-0000-0000-000000000010'
    );
  });

  it('reads tenant_id as an alias', () => {
    expect(readJobTenantId({ tenant_id: '00000000-0000-0000-0000-000000000010' })).toBe(
      '00000000-0000-0000-0000-000000000010'
    );
  });

  it('rejects a job without tenant_id', () => {
    expect(() => readJobTenantId({ meetingId: 'm1' })).toThrow(TenantJobError);
    expect(() => readJobTenantId({})).toThrow(TenantJobError);
    try {
      readJobTenantId({ tenantId: '' });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TenantJobError);
      expect((err as TenantJobError).code).toBe('TENANT_REQUIRED');
    }
  });
});

describe('runTenantJob', () => {
  beforeEach(() => {
    withTenant.mockReset();
    withTenant.mockImplementation(async (_tenantId: string, fn: (client: unknown) => unknown) =>
      fn({ query: vi.fn() })
    );
  });

  it('runs the handler under withTenant', async () => {
    const tenantId = '00000000-0000-0000-0000-000000000010';
    await runTenantJob({ tenantId, meetingId: 'm1' }, async (_client, id) => {
      expect(id).toBe(tenantId);
    });
    expect(withTenant).toHaveBeenCalledWith(tenantId, expect.any(Function));
  });

  it('does not open a tenant transaction when tenant_id is missing', async () => {
    await expect(runTenantJob({ meetingId: 'm1' }, async () => undefined)).rejects.toBeInstanceOf(
      TenantJobError
    );
    expect(withTenant).not.toHaveBeenCalled();
  });
});
