/**
 * Type-safe async helpers wrapping mssql.
 *
 * Compatibility layer: accepts SQLite-style positional ? placeholders
 * and auto-converts them to named @p0, @p1, ... parameters for mssql.
 * This minimises changes needed in consumer services.
 *
 * Transaction support: pass a sql.Transaction as first argument to
 * dbAllTx / dbGetTx / dbRunTx for transactional queries.
 *
 * [V3] Never concatenate user input into SQL strings.
 *      Always use the params array for user-supplied values.
 */
import sql from 'mssql';
import { getPool } from './db';

// ── Internal: convert ? placeholders → @p0, @p1, ... ─────────────────────────

function buildRequest(
  requestSource: sql.ConnectionPool | sql.Transaction,
  query: string,
  params: unknown[],
): { request: sql.Request; convertedSql: string } {
  const request = new sql.Request(requestSource as sql.ConnectionPool);
  let i = 0;
  const convertedSql = query.replace(/\?/g, () => {
    const name = `p${i}`;
    request.input(name, params[i]);
    i++;
    return `@${name}`;
  });
  return { request, convertedSql };
}

// ── Pool-level helpers ────────────────────────────────────────────────────────

export async function dbAll<T>(query: string, ...params: unknown[]): Promise<T[]> {
  const pool = await getPool();
  const { request, convertedSql } = buildRequest(pool, query, params);
  const result = await request.query<T>(convertedSql);
  return result.recordset;
}

export async function dbGet<T>(query: string, ...params: unknown[]): Promise<T | undefined> {
  const rows = await dbAll<T>(query, ...params);
  return rows[0];
}

export async function dbRun(query: string, ...params: unknown[]): Promise<void> {
  const pool = await getPool();
  const { request, convertedSql } = buildRequest(pool, query, params);
  await request.query(convertedSql);
}

/**
 * Runs an INSERT and returns the identity of the inserted row.
 * Appends SELECT SCOPE_IDENTITY() to the query automatically.
 */
export async function dbInsertGetId(query: string, ...params: unknown[]): Promise<number> {
  const pool = await getPool();
  const { request, convertedSql } = buildRequest(pool, query, params);
  const result = await request.query<{ newId: number }>(
    `${convertedSql}; SELECT SCOPE_IDENTITY() AS newId`,
  );
  return result.recordset[0].newId;
}

// ── Transaction helpers ───────────────────────────────────────────────────────

export async function dbAllTx<T>(
  tx: sql.Transaction,
  query: string,
  ...params: unknown[]
): Promise<T[]> {
  const { request, convertedSql } = buildRequest(tx, query, params);
  const result = await request.query<T>(convertedSql);
  return result.recordset;
}

export async function dbGetTx<T>(
  tx: sql.Transaction,
  query: string,
  ...params: unknown[]
): Promise<T | undefined> {
  const rows = await dbAllTx<T>(tx, query, ...params);
  return rows[0];
}

export async function dbRunTx(
  tx: sql.Transaction,
  query: string,
  ...params: unknown[]
): Promise<void> {
  const { request, convertedSql } = buildRequest(tx, query, params);
  await request.query(convertedSql);
}

export async function dbInsertGetIdTx(
  tx: sql.Transaction,
  query: string,
  ...params: unknown[]
): Promise<number> {
  const { request, convertedSql } = buildRequest(tx, query, params);
  const result = await request.query<{ newId: number }>(
    `${convertedSql}; SELECT SCOPE_IDENTITY() AS newId`,
  );
  return result.recordset[0].newId;
}

/**
 * Executes a function inside a SQL Server transaction.
 * Automatically commits on success, rolls back on error.
 */
export async function withTransaction<T>(
  fn: (tx: sql.Transaction) => Promise<T>,
): Promise<T> {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}
