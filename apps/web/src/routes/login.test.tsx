import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from './login';
import { AuthContext, type AuthContextValue } from '../hooks/useAuth';

function renderLogin(auth: Partial<AuthContextValue>, url = '/login') {
  const value: AuthContextValue = {
    status: 'unauthenticated',
    me: null,
    error: null,
    refresh: vi.fn(),
    signOut: vi.fn(),
    ...auth,
  };
  return render(
    <MemoryRouter initialEntries={[url]}>
      <AuthContext.Provider value={value}>
        <LoginPage />
      </AuthContext.Provider>
    </MemoryRouter>
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Google and Microsoft buttons', () => {
    renderLogin({});
    expect(screen.getByRole('link', { name: /continue with google/i }).getAttribute('href')).toBe(
      '/api/v1/auth/login/google'
    );
    expect(screen.getByRole('link', { name: /continue with microsoft/i }).getAttribute('href')).toBe(
      '/api/v1/auth/login/microsoft'
    );
  });

  it('shows no-access error state', () => {
    renderLogin({}, '/login?error=no_access');
    expect(screen.getByRole('alert').textContent).toMatch(/ask your admin/i);
  });

  it('shows unverified-email error state', () => {
    renderLogin({}, '/login?error=unverified');
    expect(screen.getByRole('alert').textContent).toMatch(/not verified/i);
  });
});
