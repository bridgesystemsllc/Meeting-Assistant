/**
 * Tenant context for every queue job.
 * FORGE Phase 1 process-meeting / reconciler must wrap DB work with runTenantJob
 * and put tenantId on every job payload.
 */

import type { PoolClient } from 'pg';
import { withTenant } from './db.js';

export const TENANT_REQUIRED = 'TENANT_REQUIRED';

export class TenantJobError extends Error {
  readonly code = TENANT_REQUIRED;

  constructor(message = 'Job payload is missing tenant_id') {
    super(message);
    this.name = 'TenantJobError';
  }
}

export function readJobTenantId(data: unknown): string {
  if (data === null || typeof data !== 'object') {
    throw new TenantJobError();
  }
  const record = data as { tenantId?: unknown; tenant_id?: unknown };
  const tenantId = record.tenantId ?? record.tenant_id;
  if (typeof tenantId !== 'string' || tenantId.length === 0) {
    throw new TenantJobError();
  }
  return tenantId;
}

export async function runTenantJob<T>(
  data: unknown,
  fn: (client: PoolClient, tenantId: string) => Promise<T>
): Promise<T> {
  const tenantId = readJobTenantId(data);
  return withTenant(tenantId, (client) => fn(client, tenantId));
}
