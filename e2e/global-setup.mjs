import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { OAuth2Server } from 'oauth2-mock-server';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_PASSWORD = 'app-test-secret';
const API_PORT = 3011;

async function applyMigrations(ownerUrl) {
  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    const dir = path.join(root, 'db/migrations');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
    }
    await client.query(`ALTER ROLE meeting_assistant_app WITH LOGIN PASSWORD '${APP_PASSWORD}'`);
  } finally {
    await client.end();
  }
}

export default async function globalSetup() {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const ownerUrl = container.getConnectionUri();
  await applyMigrations(ownerUrl);
  const appUrl = new URL(ownerUrl);
  appUrl.username = 'meeting_assistant_app';
  appUrl.password = APP_PASSWORD;

  const mock = new OAuth2Server();
  await mock.issuer.keys.generate('RS256');
  await mock.start(0, '127.0.0.1');
  const issuerUrl = mock.issuer.url;

  mock.service.on('beforeTokenSigning', (token) => {
    token.payload.email = 'owner@example.com';
    token.payload.email_verified = true;
    token.payload.name = 'Avery Owner';
    token.payload.sub = 'mock-sub-owner@example.com';
    token.payload.tid = 'mock-tenant';
  });
  mock.service.on('beforeUserinfo', (userInfoResponse) => {
    userInfoResponse.body.email = 'owner@example.com';
    userInfoResponse.body.name = 'Avery Owner';
  });

  const env = {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(API_PORT),
    DATABASE_URL: ownerUrl,
    APP_DATABASE_URL: appUrl.toString(),
    PG_POOL_MAX: '4',
    COOKIE_SECURE: 'false',
    FRONTEND_URL: 'http://127.0.0.1:4173',
    OIDC_ALLOW_MOCK: 'true',
    OIDC_STATE_SECRET: 'e2e-oidc-state-secret',
    PUBLIC_BASE_URL: `http://127.0.0.1:${API_PORT}`,
    GOOGLE_CLIENT_ID: 'test-google-client',
    GOOGLE_CLIENT_SECRET: 'test-google-secret',
    GOOGLE_ISSUER: issuerUrl,
    MS_CLIENT_ID: 'test-ms-client',
    MS_CLIENT_SECRET: 'test-ms-secret',
    MS_ISSUER: issuerUrl,
    LOG_LEVEL: 'silent',
    AUDIT_EMAIL_HMAC_KEY: 'test-audit-email-hmac-key',
  };

  const child = spawn(process.execPath, ['--import', 'tsx', 'apps/api/src/index.ts'], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const childLog = [];
  child.stdout.on('data', (buf) => childLog.push(String(buf)));
  child.stderr.on('data', (buf) => childLog.push(String(buf)));
  child.on('exit', (code) => {
    if (code) childLog.push(`api exited ${code}`);
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`API failed to start\n${childLog.join('')}`));
    }, 20_000);
    child.on('error', reject);
    const tryConnect = () => {
      const socket = net.connect(API_PORT, '127.0.0.1', () => {
        socket.end();
        clearTimeout(timer);
        resolve(undefined);
      });
      socket.on('error', () => setTimeout(tryConnect, 200));
    };
    tryConnect();
  });

  const statePath = path.join(root, '.playwright-stack.json');
  fs.writeFileSync(
    statePath,
    JSON.stringify({ apiPort: API_PORT, ownerUrl, issuerUrl }, null, 2)
  );

  return async () => {
    child.kill('SIGTERM');
    await mock.stop();
    await container.stop();
    try {
      fs.unlinkSync(statePath);
    } catch {
      // ignore
    }
  };
}
