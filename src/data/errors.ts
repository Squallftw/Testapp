/**
 * Typed DAL errors. Every DAL helper throws one of these subclasses; callers
 * never have to inspect raw PostgrestError or fetch error shapes.
 */

export class DALError extends Error {
  override readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = this.constructor.name;
    if (cause !== undefined) this.cause = cause;
  }
}

export class NotFoundError extends DALError {}
export class PermissionError extends DALError {}
export class ValidationError extends DALError {}
export class NetworkError extends DALError {}
export class ConflictError extends DALError {}

interface SupabaseLikeError {
  code?: string;
  message?: string;
  details?: string;
}

function isSupabaseError(err: unknown): err is SupabaseLikeError {
  return typeof err === 'object' && err !== null && ('code' in err || 'message' in err);
}

/**
 * Map any Supabase / Postgrest error to a typed DALError.
 * Reference: https://postgrest.org/en/latest/errors.html and Postgres SQLSTATE codes.
 */
export function mapSupabaseError(err: unknown): DALError {
  if (err instanceof DALError) return err;
  if (err instanceof TypeError && /fetch|network/i.test(err.message)) {
    return new NetworkError(err.message, err);
  }
  if (isSupabaseError(err)) {
    const msg = err.message ?? 'Unknown database error';
    switch (err.code) {
      case 'PGRST116':
        return new NotFoundError(msg, err);
      case '23505':
        return new ConflictError(msg, err);
      case '23503':
      case '23514':
        return new ValidationError(msg, err);
      case '42501':
        return new PermissionError(msg, err);
      default:
        return new DALError(msg, err);
    }
  }
  return new DALError(String(err), err);
}

/**
 * Unwrap a Supabase response: throws a typed error or returns the data.
 * Use on every .single() / list call where data is expected.
 */
export function unwrap<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw mapSupabaseError(result.error);
  if (result.data === null) throw new NotFoundError('No data returned');
  return result.data;
}

/**
 * Same as unwrap but allows null (for .maybeSingle() and similar).
 */
export function unwrapMaybe<T>(result: { data: T | null; error: unknown }): T | null {
  if (result.error) throw mapSupabaseError(result.error);
  return result.data;
}

/**
 * Stub helper for DAL functions awaiting feature port. Returns `never` so
 * TypeScript's return-type contract is satisfied at call sites:
 *   `return todo('module.fnName', ...args)`
 * Args are accepted (and ignored) so caller usage stays valid.
 */
export function todo(label: string, ..._args: unknown[]): never {
  throw new DALError(`${label}: not implemented — DAL stub awaiting feature port.`);
}
