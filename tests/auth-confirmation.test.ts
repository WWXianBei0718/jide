import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parseAuthConfirmationParams } from '../src/lib/auth-confirmation';

test('parses supported token-hash confirmation links', () => {
  assert.deepEqual(
    parseAuthConfirmationParams('?token_hash=abc123&type=email'),
    { code: null, tokenHash: 'abc123', type: 'email' }
  );
});

test('parses authorization-code callbacks without trusting unknown OTP types', () => {
  assert.deepEqual(parseAuthConfirmationParams('?code=pkce-code&type=unknown'), {
    code: 'pkce-code',
    tokenHash: null,
    type: null,
  });
});

test('signup and callback code use the dedicated confirmation route', () => {
  const hook = readFileSync(
    path.join(process.cwd(), 'src', 'hooks', 'useAuth.ts'),
    'utf8'
  );
  const page = readFileSync(
    path.join(process.cwd(), 'src', 'pages', 'auth', 'confirm.tsx'),
    'utf8'
  );

  assert.match(hook, /emailRedirectTo: `\$\{window\.location\.origin\}\/auth\/confirm`/);
  assert.match(page, /verifyOtp/);
  assert.match(page, /exchangeCodeForSession/);
  assert.match(page, /邮箱验证成功/);
  assert.match(page, /验证链接无效或已过期/);
});
