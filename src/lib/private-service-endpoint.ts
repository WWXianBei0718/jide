function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number);
  if (
    parts.length !== 4
    || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }

  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

export function validatePrivateServiceEndpoint(value: string): URL | null {
  try {
    const endpoint = new URL(value);
    const hostname = endpoint.hostname.toLowerCase();
    const privateHostname = hostname === 'localhost'
      || hostname === '::1'
      || hostname.endsWith('.local')
      || (!hostname.includes('.') && !hostname.includes(':'))
      || isPrivateIpv4(hostname)
      || hostname.startsWith('fc')
      || hostname.startsWith('fd');

    if (
      !['http:', 'https:'].includes(endpoint.protocol)
      || endpoint.username
      || endpoint.password
      || endpoint.search
      || endpoint.hash
      || !privateHostname
    ) {
      return null;
    }

    return endpoint;
  } catch {
    return null;
  }
}
