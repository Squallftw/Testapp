import { describe, expect, it } from 'vitest';
import {
  ConflictError,
  DALError,
  NetworkError,
  NotFoundError,
  PermissionError,
  ValidationError,
  mapSupabaseError,
  unwrap,
  unwrapMaybe,
} from './errors';

describe('mapSupabaseError', () => {
  it('returns the same instance when given a DALError', () => {
    const err = new NotFoundError('row missing');
    expect(mapSupabaseError(err)).toBe(err);
  });

  it('wraps a fetch TypeError as NetworkError preserving cause', () => {
    const err = new TypeError('Failed to fetch');
    const mapped = mapSupabaseError(err);
    expect(mapped).toBeInstanceOf(NetworkError);
    expect(mapped.message).toBe('Failed to fetch');
    expect(mapped.cause).toBe(err);
  });

  it('does NOT wrap a non-network TypeError as NetworkError', () => {
    const err = new TypeError('Cannot read property foo of undefined');
    const mapped = mapSupabaseError(err);
    expect(mapped).toBeInstanceOf(DALError);
    expect(mapped).not.toBeInstanceOf(NetworkError);
  });

  it.each([
    ['PGRST116', NotFoundError, 'no row'],
    ['23505', ConflictError, 'duplicate key'],
    ['23503', ValidationError, 'fk violation'],
    ['23514', ValidationError, 'check violation'],
    ['42501', PermissionError, 'rls denied'],
  ] as const)('maps SQLSTATE %s → %s', (code, Ctor, message) => {
    const mapped = mapSupabaseError({ code, message });
    expect(mapped).toBeInstanceOf(Ctor);
    expect(mapped.message).toBe(message);
  });

  it('falls back to plain DALError for unknown codes', () => {
    const mapped = mapSupabaseError({ code: '99999', message: 'who knows' });
    expect(mapped).toBeInstanceOf(DALError);
    expect(mapped.constructor.name).toBe('DALError');
  });

  it('falls back to DALError for bare strings', () => {
    const mapped = mapSupabaseError('plain string');
    expect(mapped).toBeInstanceOf(DALError);
    expect(mapped.message).toBe('plain string');
  });

  it('uses a generic message when a Supabase error has no message', () => {
    const mapped = mapSupabaseError({ code: '99999' });
    expect(mapped.message).toBe('Unknown database error');
  });
});

describe('unwrap', () => {
  it('returns data on success', () => {
    expect(unwrap({ data: { id: '1' }, error: null })).toEqual({ id: '1' });
  });

  it('throws NotFoundError when data is null and no error', () => {
    expect(() => unwrap({ data: null, error: null })).toThrow(NotFoundError);
  });

  it('throws the mapped typed error when error is present', () => {
    expect(() =>
      unwrap({ data: null, error: { code: '42501', message: 'denied' } })
    ).toThrow(PermissionError);
  });
});

describe('unwrapMaybe', () => {
  it('returns null when data is null with no error', () => {
    expect(unwrapMaybe({ data: null, error: null })).toBeNull();
  });

  it('returns data when present', () => {
    expect(unwrapMaybe({ data: 'x', error: null })).toBe('x');
  });

  it('throws on error even when data is null', () => {
    expect(() =>
      unwrapMaybe({ data: null, error: { code: '23505', message: 'dup' } })
    ).toThrow(ConflictError);
  });
});
