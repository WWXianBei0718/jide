import assert from 'node:assert/strict';
import test from 'node:test';
import { getAuthErrorMessage } from '../src/lib/auth-error';

test('auth network failures are shown as a clear Chinese message', () => {
  assert.equal(
    getAuthErrorMessage(new TypeError('Failed to fetch')),
    '无法连接登录服务，请检查网络后重试'
  );
});

test('auth provider messages remain available for actionable errors', () => {
  assert.equal(
    getAuthErrorMessage({ message: 'Invalid login credentials' }),
    'Invalid login credentials'
  );
});

test('unknown auth failures use a safe fallback', () => {
  assert.equal(
    getAuthErrorMessage(null),
    '登录服务暂时不可用，请稍后重试'
  );
});
