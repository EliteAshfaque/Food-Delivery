/**
 * Drizzle/driver wrappers can place PostgreSQL errors on either the thrown
 * value or its `cause`. Keep the database-specific check in one place so a
 * unique constraint race becomes the expected HTTP 409 response.
 */
export function isPostgresUniqueViolation(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; depth < 3 && current; depth += 1) {
    if (typeof current !== 'object') return false;

    const record = current as { code?: unknown; cause?: unknown };
    if (record.code === '23505') return true;
    current = record.cause;
  }

  return false;
}
