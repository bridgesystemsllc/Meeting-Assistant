import { afterEach, describe, expect, it } from 'vitest';
import { appDatabaseUrl, assertWorkerRuntimeEnv, WorkerConfigError } from './env.js';

describe('worker APP_DATABASE_URL', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('refuses to fall back to DATABASE_URL', () => {
    delete process.env.APP_DATABASE_URL;
    process.env.DATABASE_URL = 'postgres://owner@localhost/db';
    expect(() => appDatabaseUrl()).toThrow(WorkerConfigError);
    expect(() => assertWorkerRuntimeEnv()).toThrow(/APP_DATABASE_URL/);
  });
});
