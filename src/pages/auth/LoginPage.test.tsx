import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from './LoginPage';
import { AuthProvider } from '@/contexts/AuthContext';

vi.mock('@/data/client', () => ({
  getSupabase: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
    },
  }),
}));

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('LoginPage', () => {
  it('renders email and password fields and a submit button', async () => {
    renderPage();
    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Mot de passe')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /se connecter/i })).toBeInTheDocument();
  });

  it('links to signup and password reset', async () => {
    renderPage();
    expect(await screen.findByRole('link', { name: /créer un compte/i })).toHaveAttribute(
      'href',
      '/signup'
    );
    expect(screen.getByRole('link', { name: /mot de passe oublié/i })).toHaveAttribute(
      'href',
      '/reset-password'
    );
  });
});
