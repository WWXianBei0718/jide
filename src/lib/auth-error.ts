const AUTH_NETWORK_ERROR_MESSAGES = new Set([
  'Failed to fetch',
  'Network request failed',
  'Load failed',
]);

export function getAuthErrorMessage(error: unknown): string {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String(error.message)
      : '';

  if (AUTH_NETWORK_ERROR_MESSAGES.has(message)) {
    return '无法连接登录服务，请检查网络后重试';
  }

  return message || '登录服务暂时不可用，请稍后重试';
}
