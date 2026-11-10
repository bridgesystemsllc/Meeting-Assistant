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

function isSuperuserRoleAttrError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /must be superuser|BYPASSRLS|permission denied to set role attribute/i.test(msg);
}

/**
 * Apply timestamped SQL files as `ownerUrl`. When `superuserUrl` is set, role-attribute
 * statements that only a superuser can run (NOBYPASSRLS / NOSUPERUSER on 002) are
 * retried as the superuser so a non-BYPASSRLS owner can still migrate. That 002
 * line is P2-1's fix; this is a test accommodation, not a migration rewrite.
 */
export async function applyMigrations(
  ownerUrl: string,
  opts?: { superuserUrl?: string }
): Promise<void> {
  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  const superClient = opts?.superuserUrl
    ? new pg.Client({ connectionString: opts.superuserUrl })
    : null;
  if (superClient) await superClient.connect();
  try {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      try {
        await client.query(sql);
      } catch (err) {
        if (superClient && isSuperuserRoleAttrError(err)) {
          await applySqlSkippingSuperuserRoleAttrs(client, superClient, sql);
        } else {
          throw err;
        }
      }
    }
    try {
      await client.query(`ALTER ROLE meeting_assistant_app WITH LOGIN PASSWORD '${APP_PASSWORD}'`);
    } catch (err) {
      if (superClient && isSuperuserRoleAttrError(err)) {
        await superClient.query(
          `ALTER ROLE meeting_assistant_app WITH LOGIN PASSWORD '${APP_PASSWORD}'`
        );
      } else {
        throw err;
      }
    }
  } finally {
    await client.end();
    await superClient?.end();
  }
}

async function applySqlSkippingSuperuserRoleAttrs(
  owner: pg.Client,
  superuser: pg.Client,
  sql: string
): Promise<void> {
  const statements = splitSqlStatements(sql);
  for (const stmt of statements) {
    try {
      await owner.query(stmt);
    } catch (err) {
      if (!isSuperuserRoleAttrError(err)) throw err;
      if (/CREATE ROLE\s+meeting_assistant_app/i.test(stmt) || /ALTER ROLE\s+meeting_assistant_app/i.test(stmt)) {
        await superuser.query(stmt);
        continue;
      }
      await superuser.query(stmt);
    }
  }
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let buf = '';
  let i = 0;
  while (i < sql.length) {
    if (sql[i] === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i);
      i = nl === -1 ? sql.length : nl + 1;
      continue;
    }
    if (sql.startsWith("$$", i)) {
      const end = sql.indexOf("$$", i + 2);
      if (end === -1) {
        buf += sql.slice(i);
        break;
      }
      buf += sql.slice(i, end + 2);
      i = end + 2;
      continue;
    }
    if (sql[i] === ';') {
      const trimmed = buf.trim();
      if (trimmed) statements.push(trimmed);
      buf = '';
      i += 1;
      continue;
    }
    buf += sql[i];
    i += 1;
  }
  const tail = buf.trim();
  if (tail) statements.push(tail);
  return statements;
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

const NONSU_OWNER = 'ma_nonsu_owner';
const NONSU_PASSWORD = 'nonsu-owner';
const NONSU_DB = 'ma_nonsu';

function rewriteUri(
  ownerUrl: string,
  parts: { username: string; password: string; database: string }
): string {
  const url = new URL(ownerUrl);
  url.username = parts.username;
  url.password = parts.password;
  url.pathname = `/${parts.database}`;
  return url.toString();
}

/**
 * Postgres owned by a LOGIN, NOSUPERUSER, NOBYPASSRLS role. Migrations and the
 * request path run as that owner so CI catches FORCE RLS + SECURITY DEFINER
 * breakage that a superuser migrator hides.
 */
export async function startPostgresAsNonSuperOwner(): Promise<{
  container: StartedPostgreSqlContainer;
  ownerUrl: string;
  appUrl: string;
  superuserUrl: string;
}> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const superuserUrl = container.getConnectionUri();
  const admin = new pg.Client({ connectionString: superuserUrl });
  await admin.connect();
  try {
    await admin.query(
      `CREATE ROLE ${NONSU_OWNER} LOGIN PASSWORD '${NONSU_PASSWORD}' NOSUPERUSER NOBYPASSRLS CREATEROLE`
    );
    await admin.query(`CREATE DATABASE ${NONSU_DB} OWNER ${NONSU_OWNER}`);
  } finally {
    await admin.end();
  }

  const ownerUrl = rewriteUri(superuserUrl, {
    username: NONSU_OWNER,
    password: NONSU_PASSWORD,
    database: NONSU_DB,
  });
  await applyMigrations(ownerUrl, { superuserUrl });
  const appUrl = rewriteUri(ownerUrl, {
    username: 'meeting_assistant_app',
    password: APP_PASSWORD,
    database: NONSU_DB,
  });
  return { container, ownerUrl, appUrl, superuserUrl };
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
  profile: { email: string; name?: string; sub?: string }
): void {
  const handler = (token: { payload: Record<string, unknown> }) => {
    token.payload.email = profile.email;
    token.payload.email_verified = true;
    token.payload.name = profile.name ?? profile.email;
    token.payload.preferred_username = profile.email;
    if (profile.sub) token.payload.sub = profile.sub;
    token.payload.tid = 'mock-tenant';
  };
  server.service.on('beforeTokenSigning', handler);
  server.service.on('beforeUserinfo', (userInfoResponse) => {
    userInfoResponse.body.email = profile.email;
    userInfoResponse.body.email_verified = true;
    userInfoResponse.body.name = profile.name ?? profile.email;
  });
}

export function applyAuthEnv(params: { ownerUrl: string; appUrl: string; issuerUrl: string }): void {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = params.ownerUrl;
  process.env.DATABASE_APP_URL = params.appUrl;
  process.env.PG_POOL_MAX = '1';
  process.env.COOKIE_SECURE = 'false';
  process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
  process.env.OIDC_ALLOW_MOCK = 'true';
  process.env.GOOGLE_CLIENT_ID = 'test-google-client';
  process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
  process.env.GOOGLE_ISSUER = params.issuerUrl;
  process.env.MS_CLIENT_ID = 'test-ms-client';
  process.env.MS_CLIENT_SECRET = 'test-ms-secret';
  process.env.MS_ISSUER = params.issuerUrl;
  process.env.OIDC_REDIRECT_BASE = '';
  process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
}
