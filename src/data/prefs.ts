import { todo } from './errors';

export interface UserPreferences {
  user_id: string;
  org_id: string;
  last_chantier_id: string | null;
  locale_override: string | null;
  theme: string | null;
  updated_at: string;
}

/** Current user's prefs for the active org. Null if no prefs row exists yet. */
export async function getMyPrefs(): Promise<UserPreferences | null> {
  return todo('prefs.getMyPrefs');
}

export async function setLastChantier(chantierId: string | null): Promise<UserPreferences> {
  return todo('prefs.setLastChantier', chantierId);
}

export async function setLocaleOverride(locale: string | null): Promise<UserPreferences> {
  return todo('prefs.setLocaleOverride', locale);
}

export async function setTheme(theme: string | null): Promise<UserPreferences> {
  return todo('prefs.setTheme', theme);
}
