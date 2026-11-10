import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AiNotesHero } from './AiNotesHero';
import { heroContent } from './heroContent';

afterEach(() => {
  document.title = '';
});

describe('heroContent contract', () => {
  it('matches the §5.3a content snapshot', () => {
    expect(heroContent).toMatchSnapshot();
  });

  it('uses the placeholder brand and waitlist CTA', () => {
    expect(heroContent.productName).toBe('[PRODUCT NAME]');
    expect(heroContent.h1).toEqual(['[PRODUCT NAME] the future', 'of meeting notes']);
    expect(heroContent.primaryCta.href).toBe('#waitlist');
    expect(heroContent.navCta.href).toBe('#waitlist');
    expect(heroContent.showDownloadCta).toBe(false);
    expect(heroContent.video.src).toBeNull();
    expect(heroContent.socialProof.text).toBe('[PLACEHOLDER: Best AI notetaker platform.]');
    expect(heroContent.pageTitle).toBe('[PRODUCT NAME] — The future of meeting notes');
    expect(heroContent.illustrativeCaption).toBe('Illustrative product preview. Sample data.');
  });
});

describe('AiNotesHero', () => {
  it('renders required copy and hides the download CTA', () => {
    render(<AiNotesHero />);

    expect(screen.getAllByText('[PRODUCT NAME]').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      '[PRODUCT NAME] the future',
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('of meeting notes');
    expect(screen.getByText(heroContent.subtitle)).toBeTruthy();
    expect(screen.getByText('Try [PRODUCT NAME] for Free →')).toBeTruthy();
    expect(screen.getByTestId('hero-primary-cta').getAttribute('href')).toBe('#waitlist');
    expect(screen.getByText('[PLACEHOLDER: Best AI notetaker platform.]')).toBeTruthy();
    expect(screen.getByText('Illustrative product preview. Sample data.')).toBeTruthy();
    expect(screen.getByText('LIVE ANALYSIS')).toBeTruthy();
    expect(screen.getByText('ALEX RIVERA (SPEAKING)')).toBeTruthy();
    expect(screen.getByText('Gustavo Franci')).toBeTruthy();
    expect(screen.getByText('Jely Miya')).toBeTruthy();
    expect(screen.getByText('Ruben Herwitz')).toBeTruthy();
    expect(screen.queryByText('Download app')).toBeNull();
    expect(document.title).toBe('[PRODUCT NAME] — The future of meeting notes');
  });

  it('does not render the unbracketed social-proof claim', () => {
    const { container } = render(<AiNotesHero />);
    const stripped = (container.textContent ?? '').replaceAll(
      '[PLACEHOLDER: Best AI notetaker platform.]',
      '',
    );
    expect(stripped).not.toMatch(/Best AI notetaker platform/);
  });

  it('tags illustrative mockup stats', () => {
    render(<AiNotesHero />);
    expect(screen.getByText(/AI EFFICIENCY\s+88%/)).toBeTruthy();
    expect(screen.getByText(/SENTIMENT/)).toBeTruthy();
    expect(screen.getByText('Positive')).toBeTruthy();
    expect(screen.getAllByText('Illustrative').length).toBeGreaterThanOrEqual(3);
  });

  it('renders nav labels in spec order', () => {
    render(<AiNotesHero />);
    const labels = heroContent.nav.map((item) => item.label);
    expect(labels).toEqual(['Company', 'Features', 'Integrations', 'Pages', 'Pricing', 'Article']);
    for (const label of labels) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });
});
