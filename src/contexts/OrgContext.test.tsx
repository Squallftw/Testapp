import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type * as OrgsModule from '@/data/orgs';
import { AuthProvider } from './AuthContext';
import { OrgProvider, useOrg } from './OrgContext';

vi.mock('@/data/client', () => ({
  getSupabase: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  }),
  setActiveOrg: vi.fn(),
}));

vi.mock('@/data/orgs', async () => {
  const actual = await vi.importActual<typeof OrgsModule>('@/data/orgs');
  return {
    ...actual,
    listMyOrgs: vi.fn().mockResolvedValue([]),
  };
});

describe('useOrg', () => {
  it('throws when used outside an OrgProvider', () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useOrg())).toThrow(
      /useOrg must be used within an OrgProvider/
    );
    consoleErr.mockRestore();
  });

  it('exposes the org context shape inside provider', async () => {
    const { result } = renderHook(() => useOrg(), {
      wrapper: ({ children }) => (
        <AuthProvider>
          <OrgProvider>{children}</OrgProvider>
        </AuthProvider>
      ),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.orgs).toEqual([]);
    expect(result.current.activeOrg).toBeNull();
    expect(typeof result.current.selectOrg).toBe('function');
    expect(typeof result.current.refresh).toBe('function');
  });
});
