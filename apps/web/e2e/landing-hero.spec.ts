import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import fs from 'node:fs';

const SCREEN_DIR = path.join(process.cwd(), 'e2e', 'screenshots');
const ARTIFACT_DIR = '/opt/cursor/artifacts';

const BANNED_HOSTS = [
  'cdn.jiro.build',
  'images.unsplash.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

function saveScreenshot(name: string, buffer: Buffer) {
  fs.mkdirSync(SCREEN_DIR, { recursive: true });
  fs.writeFileSync(path.join(SCREEN_DIR, name), buffer);
  try {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    fs.writeFileSync(path.join(ARTIFACT_DIR, name), buffer);
  } catch {
    // Artifacts dir is optional outside the cloud agent.
  }
}

test.describe('§5.3a landing hero', () => {
  test('computed styles, copy, fonts, network, sticky nav, CLS', async ({ page }) => {
    const thirdParty: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (BANNED_HOSTS.some((host) => url.includes(host))) {
        thirdParty.push(url);
      }
    });

    await page.goto('/');
    await page.waitForSelector('[data-testid="ai-notes-hero"]');
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('[data-testid="ai-notes-hero"] article').first()).toHaveCSS(
      'opacity',
      '1',
    );

    const hero = page.getByTestId('ai-notes-hero');
    await hero.scrollIntoViewIfNeeded();

    const bg = await hero.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgb(3, 3, 4)');

    const font = await hero.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(font.toLowerCase().startsWith('manrope')).toBe(true);

    const cta = page.getByTestId('hero-primary-cta');
    const ctaImage = await cta.evaluate((el) => getComputedStyle(el).backgroundImage);
    // #9060f0 → rgb(144, 96, 240); #b180fe → rgb(177, 128, 254)
    expect(ctaImage).toMatch(/rgb\(144,\s*96,\s*240\)/);
    expect(ctaImage).toMatch(/rgb\(177,\s*128,\s*254\)/);

    await expect(page.locator('h1')).toHaveCount(1);
    await expect(hero).toContainText('[PLACEHOLDER: Best AI notetaker platform.]');
    await expect(hero).not.toContainText('Download app');
    await expect(page).toHaveTitle('[PRODUCT NAME] — The future of meeting notes');

    const requests = await page.evaluate(() =>
      performance.getEntriesByType('resource').map((entry) => (entry as PerformanceResourceTiming).name),
    );
    expect(requests.some((url) => url.includes('/fonts/manrope/') && url.endsWith('.woff2'))).toBe(
      true,
    );
    expect(requests.some((url) => /inter/i.test(url))).toBe(false);
    expect(thirdParty).toEqual([]);
    expect(
      requests.filter((url) => BANNED_HOSTS.some((host) => url.includes(host))),
    ).toEqual([]);

    const videoBox = await page.getByTestId('hero-video-layer').boundingBox();
    const heroBox = await hero.boundingBox();
    expect(videoBox && heroBox).toBeTruthy();
    if (videoBox && heroBox) {
      expect(videoBox.y).toBeGreaterThanOrEqual(heroBox.y - 1);
      expect(videoBox.y + videoBox.height).toBeLessThanOrEqual(heroBox.y + heroBox.height + 1);
    }

    const cls = await page.evaluate(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      let value = 0;
      const entries = performance.getEntriesByType('layout-shift') as PerformanceEntry[];
      for (const entry of entries) {
        const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
        if (!shift.hadRecentInput) value += shift.value;
      }
      return value;
    });
    expect(cls).toBeLessThan(0.1);

    const heroTop = await hero.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    await page.evaluate((y) => window.scrollTo(0, y), heroTop + 1000);
    const nav = page.getByTestId('hero-nav');
    await expect(nav).toBeVisible();
    const navCss = await nav.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        position: getComputedStyle(el.parentElement ?? el).position,
        top: getComputedStyle(el.parentElement ?? el).top,
        blur: style.backdropFilter || style.webkitBackdropFilter,
      };
    });
    expect(navCss.position).toBe('sticky');
    expect(navCss.top).toBe('16px');
    expect(navCss.blur).toMatch(/blur/i);
  });

  test('reduced motion does not autoplay video or run entrance animations', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const hero = page.getByTestId('ai-notes-hero');
    await hero.scrollIntoViewIfNeeded();
    await expect(hero.locator('video')).toHaveCount(0);
    const animated = await hero.evaluate((el) => {
      const nodes = [...el.querySelectorAll('*')];
      return nodes.some((node) => {
        const style = getComputedStyle(node);
        const name = style.animationName;
        const duration = parseFloat(style.animationDuration || '0');
        return name !== 'none' && duration > 0;
      });
    });
    expect(animated).toBe(false);
  });

  test('axe has no serious violations and a single h1', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('ai-notes-hero').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-testid="ai-notes-hero"] article').first()).toHaveCSS(
      'opacity',
      '1',
    );
    await expect(page.locator('h1')).toHaveCount(1);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test('390px stacks panels with no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const hero = page.getByTestId('ai-notes-hero');
    await hero.scrollIntoViewIfNeeded();
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth + 1);

    const panels = hero.locator('article');
    await expect(panels).toHaveCount(3);
    const boxes = await panels.evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { top: box.top, left: box.left, width: box.width };
      }),
    );
    expect(boxes[1].top).toBeGreaterThan(boxes[0].top + 40);
    expect(boxes[2].top).toBeGreaterThan(boxes[1].top + 40);
    await expect(page.getByTestId('hero-sentiment')).toBeHidden();
  });

  for (const viewport of [
    { name: '1440x900', width: 1440, height: 900 },
    { name: '1024x768', width: 1024, height: 768 },
    { name: '390x844', width: 390, height: 844 },
  ]) {
    test(`screenshots at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');
      const hero = page.getByTestId('ai-notes-hero');
      await hero.scrollIntoViewIfNeeded();
      saveScreenshot(`hero-default-${viewport.name}.png`, await hero.screenshot());

      const heroTop = await hero.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
      await page.evaluate((y) => window.scrollTo(0, y), heroTop + 1000);
      saveScreenshot(
        `hero-sticky-${viewport.name}.png`,
        await page.getByTestId('hero-nav').screenshot(),
      );

      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/');
      await page.getByTestId('ai-notes-hero').scrollIntoViewIfNeeded();
      saveScreenshot(
        `hero-reduced-motion-${viewport.name}.png`,
        await page.getByTestId('ai-notes-hero').screenshot(),
      );
    });
  }
});
