import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { inspectServerEnvironment } from '../src/lib/environment';

test('accepts complete server configuration without exposing secret values', () => {
  const status = inspectServerEnvironment({
    NODE_ENV: 'production',
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'publishable-placeholder',
    SUPABASE_SERVICE_ROLE_KEY: 'server-secret-placeholder',
  });

  assert.deepEqual(status, {
    ready: true,
    missing: [],
    invalid: [],
  });
  assert.doesNotMatch(
    JSON.stringify(status),
    /publishable-placeholder|server-secret-placeholder/
  );
});

test('rejects missing core configuration and insecure production URLs', () => {
  const missing = inspectServerEnvironment({});
  const insecure = inspectServerEnvironment({
    NODE_ENV: 'production',
    NEXT_PUBLIC_SUPABASE_URL: 'http://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'publishable-placeholder',
    SUPABASE_SERVICE_ROLE_KEY: 'server-secret-placeholder',
  });

  assert.deepEqual(missing.missing, [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]);
  assert.deepEqual(insecure.invalid, ['NEXT_PUBLIC_SUPABASE_URL']);
});

test('health endpoint fails closed without leaking provider error details', () => {
  const healthSource = readFileSync(
    path.join(process.cwd(), 'src', 'pages', 'api', 'health.ts'),
    'utf8'
  );

  assert.match(healthSource, /inspectServerEnvironment\(\)\.ready/);
  assert.match(healthSource, /Cache-Control', 'no-store'/);
  assert.match(healthSource, /status\(503\)/);
  assert.doesNotMatch(healthSource, /error\.message|sample_data/);
});

