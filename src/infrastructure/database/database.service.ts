import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { config } from 'dotenv';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

config({ path: '.env.local', quiet: true });

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    const required = [
      'DB_HOST',
      'DB_PORT',
      'DB_NAME',
      'DB_USER',
      'DB_PASSWORD',
    ] as const;
    for (const key of required) {
      if (!process.env[key]) throw new Error(`Falta la variable ${key}`);
    }

    const port = Number(process.env.DB_PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('DB_PORT debe ser un puerto válido');
    }

    this.pool = new Pool({
      host: process.env.DB_HOST,
      port,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      max: 10,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    });
  }

  async onModuleInit(): Promise<void> {
    const version = await this.version();
    if (version.major !== 18) {
      throw new Error(
        `MotoX requiere PostgreSQL 18; se encontró ${version.major}`,
      );
    }
  }

  async version(): Promise<{ major: number; number: number }> {
    const result = await this.pool.query<{ version_num: string }>(
      "SELECT current_setting('server_version_num') AS version_num",
    );
    const number = Number(result.rows[0].version_num);
    return { major: Math.floor(number / 10000), number };
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(sql, [...params]);
  }

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async schemaVersion(): Promise<string | null> {
    const result = await this.query<{ filename: string | null }>(
      "SELECT CASE WHEN to_regclass('public.schema_migrations') IS NULL THEN NULL ELSE (SELECT max(filename) FROM schema_migrations) END AS filename",
    );
    return result.rows[0]?.filename ?? null;
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
