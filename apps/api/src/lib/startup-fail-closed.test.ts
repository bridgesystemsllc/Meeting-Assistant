import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const apiEntry = path.join(repoRoot, 'apps/api/src/index.ts');

function bootApi(extra: NodeJS.ProcessEnv): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', apiEntry], {
      cwd: repoRoot,
      env: { ...process.env, ...extra },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout?.on('data', (chunk) => {
      output += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      output += String(chunk);
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`API process did not exit. output=${output}`));
    }, 15_000);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

describe('API boot fail-closed', () => {
  it('refuses to start when only the owner DATABASE_URL is set', async () => {
    const result = await bootApi({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgres://owner:secret@127.0.0.1:5432/meeting_assistant',
      APP_DATABASE_URL: '',
      LOG_LEVEL: 'silent',
    });
    expect(result.code).not.toBe(0);
    expect(result.output).toMatch(/APP_DATABASE_URL/);
  });
});
