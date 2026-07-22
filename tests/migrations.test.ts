import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migrationsDirectory = path.join(process.cwd(), 'supabase', 'migrations');

test('database migrations include the initial schema before feature migrations', () => {
  const files = readdirSync(migrationsDirectory).filter((file) => file.endsWith('.sql')).sort();

  assert.deepEqual(files, [
    '202607150000_initial_schema.sql',
    '202607150001_secure_multimedia_uploads.sql',
    '202607150002_harden_relationship_rls.sql',
    '202607220000_add_chat_rate_limits.sql',
  ]);
});

test('chat quota migration enforces authenticated atomic limits without client table access', () => {
  const sql = readFileSync(
    path.join(migrationsDirectory, '202607220000_add_chat_rate_limits.sql'),
    'utf8'
  ).toLowerCase();

  assert.match(sql, /current_user_id uuid := auth\.uid\(\)/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /minute_count >= 10/);
  assert.match(sql, /day_count >= 100/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.chat_usage_events from anon, authenticated/);
  assert.match(sql, /grant execute on function public\.consume_chat_quota\(\) to authenticated/);
});

test('initial schema enables pgvector before declaring vector columns', () => {
  const sql = readFileSync(
    path.join(migrationsDirectory, '202607150000_initial_schema.sql'),
    'utf8'
  ).toLowerCase();

  const extensionIndex = sql.indexOf('create extension if not exists vector');
  const vectorColumnIndex = sql.indexOf('embedding vector(1536)');

  assert.notEqual(extensionIndex, -1);
  assert.notEqual(vectorColumnIndex, -1);
  assert.ok(extensionIndex < vectorColumnIndex);
});

test('relationship RLS binds conversations, messages, and consents to the authenticated owner', () => {
  const sql = readFileSync(
    path.join(migrationsDirectory, '202607150002_harden_relationship_rls.sql'),
    'utf8'
  ).toLowerCase();

  assert.match(sql, /conversations\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /messages\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /consents\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /profile\.id = conversations\.memory_profile_id/);
  assert.match(sql, /profile\.id = messages\.memory_profile_id/);
  assert.match(sql, /profile\.id = consents\.memory_profile_id/);
});
