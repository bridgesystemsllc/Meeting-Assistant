import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './components/AuthProvider';

describe('App public marketing routes', () => {
  it('renders the §5.3a hero at /', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('ai-notes-hero')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('[PRODUCT NAME]');
  });

  it('renders pricing at /pricing without price literals', async () => {
    render(
      <MemoryRouter initialEntries={['/pricing']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: /plans for every team/i })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\$\s*\d/);
  });
});
