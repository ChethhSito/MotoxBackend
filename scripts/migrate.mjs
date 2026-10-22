import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { config } from 'dotenv';
import pg from 'pg';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(root, '.env.local'), quiet: true });
const required = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Falta ${key}`);
}

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

try {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(482017)');
    const version = await client.query("SELECT current_setting('server_version_num') AS num");
    if (Math.floor(Number(version.rows[0].num) / 10000) !== 18) {
      throw new Error('Las migraciones requieren PostgreSQL 18');
    }
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const files = (await readdir(join(root, 'migrations')))
      .filter((name) => /^\d+_.*\.sql$/.test(name))
      .sort();
    for (const filename of files) {
      const sql = await readFile(join(root, 'migrations', filename), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query(
        'SELECT checksum FROM schema_migrations WHERE filename = $1',
        [filename],
      );
      if (existing.rowCount) {
        if (existing.rows[0].checksum !== checksum) {
          throw new Error(`La migración ${filename} cambió después de aplicarse`);
        }
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
          [filename, checksum],
        );
        await client.query('COMMIT');
        process.stdout.write(`Aplicada ${filename}\n`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(482017)');
    client.release();
  }
} finally {
  await pool.end();
}
