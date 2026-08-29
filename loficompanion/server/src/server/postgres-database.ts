import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Pool, types, type PoolClient, type QueryResultRow } from 'pg';

export type SQLInputValue = string | number | boolean | null | Buffer;

export interface RunResult {
  changes: number;
}

type QueryExecutor = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

const transactionClient = new AsyncLocalStorage<PoolClient>();
types.setTypeParser(20, Number);

function connectionString() {
  if (process.env.PGHOST) return undefined;
  const value =
    process.env.AUTH_DATABASE_URL ??
    process.env.DATABASE_URL ??
    process.env.MOBILEUI_DATABASE_URL;
  if (
    value ||
    process.env.AUTH_SKIP_DATABASE_INIT === '1' ||
    process.env.MOBILEUI_SKIP_DATABASE_INIT === '1'
  ) {
    return value;
  }
  if (!value) {
    throw new Error(
      'PostgreSQL is not configured. Set AUTH_DATABASE_URL or DATABASE_URL.',
    );
  }
  return value;
}

function bindParameters(sql: string) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function camelCaseAliases(sql: string) {
  return [...sql.matchAll(/\bAS\s+([a-z][a-zA-Z0-9]*)/gi)]
    .map((match) => match[1])
    .filter((alias) => /[A-Z]/.test(alias));
}

function restoreAliases<T extends QueryResultRow>(sql: string, row: T): T {
  const mutable = row as QueryResultRow;
  for (const alias of camelCaseAliases(sql)) {
    const folded = alias.toLowerCase();
    if (folded in mutable && !(alias in mutable)) {
      mutable[alias] = mutable[folded];
      delete mutable[folded];
    }
  }
  return row;
}

class PreparedStatement {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly sql: string,
  ) {}

  async get<T extends QueryResultRow = QueryResultRow>(
    ...params: SQLInputValue[]
  ): Promise<T | undefined> {
    const result = await this.database.query<T>(this.sql, params);
    const row = result.rows[0];
    return row ? restoreAliases(this.sql, row) : undefined;
  }

  async all<T extends QueryResultRow = QueryResultRow>(
    ...params: SQLInputValue[]
  ): Promise<T[]> {
    const result = await this.database.query<T>(this.sql, params);
    return result.rows.map((row) => restoreAliases(this.sql, row));
  }

  async run(...params: SQLInputValue[]): Promise<RunResult> {
    const result = await this.database.query(this.sql, params);
    return { changes: result.rowCount ?? 0 };
  }
}

export class PostgresDatabase {
  private readonly pool = new Pool({
    connectionString: connectionString(),
    max: Number(
      process.env.AUTH_DATABASE_POOL_SIZE ??
        process.env.MOBILEUI_DATABASE_POOL_SIZE ??
        10,
    ),
  });

  prepare(sql: string) {
    return new PreparedStatement(this, bindParameters(sql));
  }

  async exec(sql: string) {
    await this.executor().query(sql);
  }

  async query<T extends QueryResultRow>(
    sql: string,
    params: SQLInputValue[],
  ) {
    return this.executor().query<T>(sql, params);
  }

  async transaction<T>(action: () => Promise<T>): Promise<T> {
    const ambient = transactionClient.getStore();
    if (ambient) {
      const sp = `sp_${randomUUID().replace(/-/g, '')}`;
      try {
        await ambient.query(`SAVEPOINT ${sp}`);
        const result = await transactionClient.run(ambient, action);
        await ambient.query(`RELEASE SAVEPOINT ${sp}`);
        return result;
      } catch (error) {
        await ambient.query(`ROLLBACK TO SAVEPOINT ${sp}`);
        throw error;
      }
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await transactionClient.run(client, action);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }

  private executor(): QueryExecutor {
    return transactionClient.getStore() ?? this.pool;
  }
}
