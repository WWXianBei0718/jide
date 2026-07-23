import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const nextConfig = require('../next.config.js') as {
  headers: () => Promise<Array<{
    source: string;
    headers: Array<{ key: string; value: string }>;
  }>>;
};

test('production responses carry the browser security baseline', async () => {
  const rules = await nextConfig.headers();
  assert.equal(rules.length, 1);
  assert.equal(rules[0].source, '/(.*)');

  const headers = Object.fromEntries(
    rules[0].headers.map(({ key, value }) => [key, value])
  );

  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(headers['Strict-Transport-Security'], 'max-age=31536000; includeSubDomains');
  assert.match(headers['Permissions-Policy'], /camera=\(\)/);
  assert.match(headers['Permissions-Policy'], /geolocation=\(\)/);
});

test('content policy blocks plugins and framing while limiting browser network access', async () => {
  const [rule] = await nextConfig.headers();
  const policy = rule.headers.find(({ key }) => key === 'Content-Security-Policy')?.value;

  assert.ok(policy);
  assert.match(policy, /default-src 'self'/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /connect-src 'self' https:\/\/\*\.supabase\.co/);
  assert.doesNotMatch(policy, /api\.openai\.com|api\.elevenlabs\.io/);
  assert.doesNotMatch(policy, /unsafe-eval/);
});
