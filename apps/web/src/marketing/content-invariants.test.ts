import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = path.resolve(webRoot, '../..');

const SKIP_DIR = new Set([
  'node_modules',
  'dist',
  'test-results',
  'playwright-report',
  '.git',
  'e2e',
]);

function walk(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

const SOURCE_EXT = /\.(tsx?|jsx?|css|md|html)$/;

function readUiFiles(roots: string[]): { file: string; text: string }[] {
  return roots.flatMap((root) =>
    walk(root)
      .filter((file) => SOURCE_EXT.test(file))
      .filter((file) => !/\.(test|spec)\.(t|j)sx?$/.test(file))
      .map((file) => ({ file, text: fs.readFileSync(file, 'utf8') })),
  );
}

describe('§5.3a content invariants', () => {
  const heroDir = path.join(webRoot, 'src/marketing/AiNotesHero');
  const uiFiles = readUiFiles([
    path.join(webRoot, 'src'),
    path.join(repoRoot, 'frontend'),
  ]);

  it('does not import next/* in the hero component', () => {
    const heroFiles = walk(heroDir).filter((file) => SOURCE_EXT.test(file));
    for (const file of heroFiles) {
      const text = fs.readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/from ['"]next\//);
      expect(text, file).not.toMatch(/require\(['"]next\//);
    }
  });

  it('only imports the allowed lucide icons in AiNotesHero', () => {
    const tsx = fs.readFileSync(path.join(heroDir, 'AiNotesHero.tsx'), 'utf8');
    const match = tsx.match(/from 'lucide-react'/);
    expect(match).toBeTruthy();
    const importLine = tsx
      .split('\n')
      .filter((line) => line.includes('lucide-react'))
      .join('\n');
    const names = [...importLine.matchAll(/\b([A-Z][A-Za-z]+)\b/g)].map((m) => m[1]);
    const allowed = new Set([
      'Sparkles',
      'Monitor',
      'Mic',
      'Video',
      'Phone',
      'User',
      'FileText',
      'Brain',
    ]);
    for (const name of names) {
      expect(allowed.has(name), name).toBe(true);
    }
  });

  it('has no forbidden brand strings in apps/web or frontend UI', () => {
    // Built from parts so this file does not trip the CI brand-string denylist.
    const forbidden = new RegExp(['ka', 'rev', 'e'].join(''), 'i');
    for (const { file, text } of uiFiles) {
      expect(text, file).not.toMatch(forbidden);
    }
  });

  it('does not render Download app outside the hidden content flag', () => {
    const heroTsx = fs.readFileSync(path.join(heroDir, 'AiNotesHero.tsx'), 'utf8');
    expect(heroTsx).toMatch(/showDownloadCta \?/);
    for (const { file, text } of uiFiles) {
      if (file.endsWith('heroContent.ts')) continue;
      if (text.includes('Download app')) {
        expect(file, 'Download app leaked outside heroContent').toBe('heroContent.ts');
      }
    }
  });

  it('removes fake logos and stats from ported social proof and UI', () => {
    for (const { file, text } of uiFiles) {
      expect(text, file).not.toMatch(/Acme Corp/);
      expect(text, file).not.toMatch(/TechFlow/);
      expect(text, file).not.toMatch(/Nexus AI/);
      expect(text, file).not.toMatch(/10,000\+/);
      expect(text, file).not.toMatch(/50,000\+/);
      expect(text, file).not.toMatch(/98%/);
    }
  });

  it('removes price literals from apps/web and frontend UI', () => {
    const price = /\$\s*\d/;
    for (const { file, text } of uiFiles) {
      expect(text, file).not.toMatch(price);
    }
  });

  it('does not leave Velara or Meeting Assistant strings in landing UI', () => {
    const landingFiles = readUiFiles([path.join(webRoot, 'src/marketing')]);
    for (const { file, text } of landingFiles) {
      expect(text, file).not.toMatch(/VelaraAi|Velara/);
      expect(text, file).not.toMatch(/Meeting Assistant/);
      expect(text, file).not.toMatch(/Bridge Systems/);
    }
  });

  it('self-hosts Manrope and Geist with OFL files and no Inter', () => {
    for (const weight of [400, 500, 600, 700]) {
      expect(
        fs.existsSync(path.join(webRoot, `public/fonts/manrope/manrope-latin-${weight}.woff2`)),
      ).toBe(true);
      expect(
        fs.existsSync(path.join(webRoot, `public/fonts/geist/geist-sans-latin-${weight}.woff2`)),
      ).toBe(true);
    }
    expect(fs.existsSync(path.join(webRoot, 'public/fonts/manrope/OFL.txt'))).toBe(true);
    expect(fs.existsSync(path.join(webRoot, 'public/fonts/geist/OFL.txt'))).toBe(true);
    expect(fs.existsSync(path.join(webRoot, 'public/media/hero/ATTRIBUTION.md'))).toBe(true);
    expect(fs.existsSync(path.join(webRoot, 'public/media/hero/LICENSE.md'))).toBe(true);
    expect(fs.existsSync(path.join(webRoot, 'public/media/hero/poster.webp'))).toBe(true);
    const interFiles = walk(path.join(webRoot, 'public/fonts')).filter((file) =>
      /inter/i.test(file),
    );
    expect(interFiles).toEqual([]);
  });

  it('leaves Tailwind, PostCSS, Vite, global CSS, and the HTML shell untouched', () => {
    const indexCss = fs.readFileSync(path.join(webRoot, 'src/styles/index.css'), 'utf8');
    expect(indexCss).not.toMatch(/@font-face/);
    expect(indexCss).not.toMatch(/Manrope|Geist/);
    const vite = fs.readFileSync(path.join(webRoot, 'vite.config.ts'), 'utf8');
    expect(vite).not.toMatch(/Manrope|hero/);
    const html = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8');
    expect(html).toMatch(/<title>\[PRODUCT NAME\]<\/title>/);
  });
});
