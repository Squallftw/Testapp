import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ErrorBoundary } from './error-boundary';

function Boom(): null {
  throw new Error('kaboom');
}

// Flag-driven child so the reset test can flip the underlying cause —
// React error boundaries re-catch on re-render if the child still throws.
let conditionalThrow = true;
function Conditional() {
  if (conditionalThrow) throw new Error('kaboom');
  return <p>recovered</p>;
}

describe('ErrorBoundary', () => {
  it('renders children when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <p>hello</p>
      </ErrorBoundary>
    );
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('catches a child throw and renders the fallback UI', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText('Une erreur est survenue')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /réessayer/i })).toBeInTheDocument();
    spy.mockRestore();
  });

  it('renders the error name as a quotable code (not the raw message)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText('Error', { selector: 'code' })).toBeInTheDocument();
    spy.mockRestore();
  });

  it('reset re-renders children when the underlying cause is fixed', () => {
    conditionalThrow = true;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Conditional />
      </ErrorBoundary>
    );
    expect(screen.getByText('Une erreur est survenue')).toBeInTheDocument();
    conditionalThrow = false;
    fireEvent.click(screen.getByRole('button', { name: /réessayer/i }));
    expect(screen.getByText('recovered')).toBeInTheDocument();
    spy.mockRestore();
  });
});
