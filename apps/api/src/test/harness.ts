import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { OAuth2Server } from 'oauth2-mock-server';

const APP_PASSWORD = 'app-test-secret';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '../../../../db/migrations');

export interface TestStack {
  container: StartedPostgreSqlContainer;
  ownerUrl: string;
  appUrl: string;
  mockOidc: OAuth2Server;
  issuerUrl: string;
}

export async function applyMigrations(ownerUrl: string): Promise<void> {
  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await client.query(sql);
    }
    await client.query(`ALTER ROLE meeting_assistant_app WITH LOGIN PASSWORD '${APP_PASSWORD}'`);
  } finally {
    await client.end();
  }
}

function appConnectionUrl(ownerUrl: string): string {
  const url = new URL(ownerUrl);
  url.username = 'meeting_assistant_app';
  url.password = APP_PASSWORD;
  return url.toString();
}

export async function startPostgres(): Promise<{ container: StartedPostgreSqlContainer; ownerUrl: string; appUrl: string }> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const ownerUrl = container.getConnectionUri();
  await applyMigrations(ownerUrl);
  return { container, ownerUrl, appUrl: appConnectionUrl(ownerUrl) };
}

export async function startMockOidc(): Promise<{ server: OAuth2Server; issuerUrl: string }> {
  const server = new OAuth2Server();
  await server.issuer.keys.generate('RS256');
  await server.start(0, '127.0.0.1');
  const issuerUrl = server.issuer.url;
  if (!issuerUrl) {
    throw new Error('mock OIDC issuer URL missing');
  }
  return { server, issuerUrl };
}

export function configureMockUser(
  server: OAuth2Server,
  profile: {
    email: string;
    name?: string;
    sub?: string;
    emailVerified?: boolean;
    xmsEdov?: boolean;
  }
): void {
  server.service.removeAllListeners('beforeTokenSigning');
  server.service.removeAllListeners('beforeUserinfo');
  const emailVerified = profile.emailVerified !== false;
  const sub = profile.sub ?? `mock-sub-${profile.email}`;
  const handler = (token: { payload: Record<string, unknown> }) => {
    token.payload.email = profile.email;
    token.payload.email_verified = emailVerified;
    token.payload.name = profile.name ?? profile.email;
    token.payload.preferred_username = profile.email;
    token.payload.sub = sub;
    token.payload.tid = 'mock-tenant';
    if (profile.xmsEdov === true) token.payload.xms_edov = true;
    if (profile.xmsEdov === false) token.payload.xms_edov = false;
  };
  server.service.on('beforeTokenSigning', handler);
  server.service.on('beforeUserinfo', (userInfoResponse) => {
    userInfoResponse.body.email = profile.email;
    userInfoResponse.body.email_verified = emailVerified;
    userInfoResponse.body.name = profile.name ?? profile.email;
    userInfoResponse.body.sub = sub;
  });
}

export function applyAuthEnv(params: { ownerUrl: string; appUrl: string; issuerUrl: string }): void {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = params.ownerUrl;
  process.env.APP_DATABASE_URL = params.appUrl;
  delete process.env.DATABASE_APP_URL;
  process.env.PG_POOL_MAX = '1';
  process.env.COOKIE_SECURE = 'false';
  process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
  process.env.OIDC_ALLOW_MOCK = 'true';
  process.env.OIDC_STATE_SECRET = 'test-oidc-state-secret';
  process.env.GOOGLE_CLIENT_ID = 'test-google-client';
  process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
  process.env.GOOGLE_ISSUER = params.issuerUrl;
  process.env.MS_CLIENT_ID = 'test-ms-client';
  process.env.MS_CLIENT_SECRET = 'test-ms-secret';
  process.env.MS_ISSUER = params.issuerUrl;
  process.env.OIDC_REDIRECT_BASE = '';
  process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
}
