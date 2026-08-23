// Tiny, dependency-free migration runner: applies schema.sql once.
// Run with: npm run migrate
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import 'dotenv/config';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query(sql);
  console.log('✓ schema applied');
} catch (err) {
  console.error('✗ migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
