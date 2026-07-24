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
    '202607220001_secure_memory_chunks.sql',
    '202607230000_add_external_api_quotas.sql',
    '202607230001_add_upload_quotas.sql',
    '202607230002_restrict_message_roles.sql',
    '202607230003_add_embedding_quotas.sql',
    '202607240000_atomic_account_deletion.sql',
  ]);
});

test('account deletion migration removes user-owned rows in one service-only transaction', () => {
  const sql = readFileSync(
    path.join(migrationsDirectory, '202607240000_atomic_account_deletion.sql'),
    'utf8'
  ).toLowerCase();

  assert.match(sql, /create or replace function public\.delete_user_owned_account_data\(p_user_id uuid\)/);
  assert.match(sql, /delete from public\.messages where user_id = p_user_id/);
  assert.match(sql, /delete from public\.memory_profiles where user_id = p_user_id/);
  assert.match(sql, /delete from public\.external_api_usage_events where user_id = p_user_id/);
  assert.match(sql, /revoke all on function public\.delete_user_owned_account_data\(uuid\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.delete_user_owned_account_data\(uuid\) to service_role/);
});

test('embedding quota migration limits indexing requests and source characters', () => {
  const sql = readFileSync(
    path.join(migrationsDirectory, '202607230003_add_embedding_quotas.sql'),
    'utf8'
  ).toLowerCase();

  assert.match(sql, /operation in \('voice_clone', 'tts', 'upload', 'embedding'\)/);
  assert.match(sql, /requested_operation = 'embedding'/);
  assert.match(sql, /burst_limit := 20/);
  assert.match(sql, /daily_request_limit := 200/);
  assert.match(sql, /daily_unit_limit := 4000000/);
  assert.match(sql, /pg_advisory_xact_lock/);
});

test('message role migration prevents authenticated clients from forging AI history', () => {
  const sql = readFileSync(
    path.join(migrationsDirectory, '202607230002_restrict_message_roles.sql'),
    'utf8'
  ).toLowerCase();

  assert.match(sql, /drop policy if exists "users can create messages for their own profiles"/);
  assert.match(sql, /for insert\s+to authenticated/);
  assert.match(sql, /messages\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /messages\.role = 'user'/);
  assert.match(sql, /profile\.user_id = \(select auth\.uid\(\)\)/);
});

test('upload quota migration limits signed upload requests by count and bytes', () => {
  const sql = readFileSync(
    path.join(migrationsDirectory, '202607230001_add_upload_quotas.sql'),
    'utf8'
  ).toLowerCase();

  assert.match(sql, /operation in \('voice_clone', 'tts', 'upload'\)/);
  assert.match(sql, /requested_operation = 'upload'/);
  assert.match(sql, /burst_limit := 20/);
  assert.match(sql, /daily_request_limit := 100/);
  assert.match(sql, /daily_unit_limit := 524288000/);
  assert.match(sql, /requested_units > 26214400/);
  assert.match(sql, /pg_advisory_xact_lock/);
});

test('external API quota migration atomically limits requests and billable units', () => {
  const sql = readFileSync(
    path.join(migrationsDirectory, '202607230000_add_external_api_quotas.sql'),
    'utf8'
  ).toLowerCase();

  assert.match(sql, /operation in \('voice_clone', 'tts'\)/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /daily_units \+ requested_units > daily_unit_limit/);
  assert.match(sql, /requested_operation = 'voice_clone'/);
  assert.match(sql, /requested_operation = 'tts'/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.external_api_usage_events from anon, authenticated/);
  assert.match(sql, /grant execute on function public\.consume_external_api_quota\(text, integer\) to authenticated/);
});

test('memory chunk migration prevents client writes and verifies vector-search ownership', () => {
  const sql = readFileSync(
    path.join(migrationsDirectory, '202607220001_secure_memory_chunks.sql'),
    'utf8'
  ).toLowerCase();

  assert.match(sql, /foreign key \(material_id, memory_profile_id\)/);
  assert.match(sql, /drop policy if exists "users can create chunks for their own profiles"/);
  assert.match(sql, /revoke insert, update, delete on public\.memory_chunks from anon, authenticated/);
  assert.match(sql, /security definer/);
  assert.match(sql, /profiles\.user_id = auth\.uid\(\)/);
  assert.match(sql, /grant execute on function public\.match_memory_chunks/);
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
