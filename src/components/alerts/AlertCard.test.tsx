import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AlertCard } from './AlertCard';
import type { Alert } from '@/data/alerts';

const baseAlert: Alert = {
  id: 'a1',
  org_id: 'o1',
  chantier_id: 'c1',
  kind: 'chantier_overdue',
  severity: 'critical',
  title: 'Chantier en retard',
  body: 'Villa devait se terminer le 2026-05-01, soit 17 jours de retard.',
  payload: {},
  entity_id: null,
  fingerprint: 'chantier_overdue:c1',
  first_seen_at: '2026-05-18T00:00:00Z',
  last_seen_at: '2026-05-18T00:00:00Z',
  resolved_at: null,
  dismissed_at: null,
  dismissed_by: null,
  created_at: '2026-05-18T00:00:00Z',
  updated_at: '2026-05-18T00:00:00Z',
};

function wrap(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('AlertCard', () => {
  it('renders title and body', () => {
    wrap(<AlertCard alert={baseAlert} />);
    expect(screen.getByText('Chantier en retard')).toBeInTheDocument();
    expect(screen.getByText(/Villa devait/)).toBeInTheDocument();
  });

  it('shows critical severity styling', () => {
    const { container } = wrap(<AlertCard alert={baseAlert} />);
    expect(container.querySelector('[data-severity="critical"]')).toBeInTheDocument();
  });

  it('calls onDismiss when the button is clicked', () => {
    const onDismiss = vi.fn();
    wrap(<AlertCard alert={baseAlert} onDismiss={onDismiss} />);
    screen.getByRole('button', { name: /ignorer/i }).click();
    expect(onDismiss).toHaveBeenCalledWith('a1');
  });

  it('omits the dismiss button in compact size', () => {
    wrap(<AlertCard alert={baseAlert} size="compact" onDismiss={() => {}} />);
    expect(screen.queryByRole('button', { name: /ignorer/i })).toBeNull();
  });
});
