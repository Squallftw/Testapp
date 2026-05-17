import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

let _client: SupabaseClient<Database> | null = null;
let _initUrl: string | null = null;
let _initAnonKey: string | null = null;
let _activeOrgId: string | null = null;

export interface InitOptions {
  url: string;
  anonKey: string;
}

/**
 * Initialise the singleton Supabase client. Call once at app boot
 * (typically from src/main.tsx with values from import.meta.env).
 *
 * Idempotent for the SAME credentials — extra calls return the existing
 * instance. Calling with DIFFERENT credentials throws, because that is
 * almost always a configuration bug (e.g. tests forgetting __resetForTests,
 * or HMR re-running boot with stale env).
 */
export function initSupabase({ url, anonKey }: InitOptions): SupabaseClient<Database> {
  if (_client) {
    if (url !== _initUrl || anonKey !== _initAnonKey) {
      throw new Error(
        'initSupabase() called twice with different credentials. Call __resetForTests() between test cases, or check that VITE_SUPABASE_* env values are stable.'
      );
    }
    return _client;
  }
  _initUrl = url;
  _initAnonKey = anonKey;
  _client = createClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    db: { schema: 'public' },
  });
  return _client;
}

/**
 * Get the singleton Supabase client. Throws if initSupabase() wasn't called yet.
 */
export function getSupabase(): SupabaseClient<Database> {
  if (!_client) {
    throw new Error(
      'Supabase client not initialised. Call initSupabase() at app boot before any DAL call.'
    );
  }
  return _client;
}

/**
 * Set the currently active organisation. Most DAL calls implicitly scope
 * to this org_id. Call when the user selects an org via the OrgContext provider.
 */
export function setActiveOrg(orgId: string | null): void {
  _activeOrgId = orgId;
}

/**
 * Get the currently active org_id. Throws if none is set — DAL calls that
 * need an org must ensure the OrgContext provider has selected one first.
 */
export function getActiveOrgId(): string {
  if (!_activeOrgId) {
    throw new Error(
      'No active organisation. The user must select an org before any org-scoped DAL call.'
    );
  }
  return _activeOrgId;
}

/**
 * Like getActiveOrgId() but returns null instead of throwing. Useful for
 * cross-org operations (listing user's orgs, accepting an invite).
 */
export function peekActiveOrgId(): string | null {
  return _activeOrgId;
}

/** Test-only: wipe singletons. Do NOT call from app code. */
export function __resetForTests(): void {
  _client = null;
  _initUrl = null;
  _initAnonKey = null;
  _activeOrgId = null;
}
