import { describe, expect, it } from 'vitest';
import { GLOBAL_TABLES, TENANT_TABLES, isGlobalTable } from './db-tables.js';

describe('GLOBAL_TABLES', () => {
  it('lists the ATLAS Q4 allow-list and nothing else', () => {
    expect([...GLOBAL_TABLES].sort()).toEqual(
      ['oidc_login_state', 'sessions', 'tenants', 'user_identities', 'users', 'webhook_events'].sort()
    );
  });

  it('does not overlap tenant tables', () => {
    for (const table of TENANT_TABLES) {
      expect(isGlobalTable(table)).toBe(false);
    }
  });

  it('includes consent_events in the tenant inventory', () => {
    expect(TENANT_TABLES).toContain('consent_events');
  });

  it('recognizes each exempt table', () => {
    for (const table of GLOBAL_TABLES) {
      expect(isGlobalTable(table)).toBe(true);
    }
    expect(isGlobalTable('meetings')).toBe(false);
    expect(isGlobalTable('pgmigrations')).toBe(false);
  });
});
