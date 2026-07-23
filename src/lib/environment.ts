const REQUIRED_SERVER_VARIABLES = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

export type ServerEnvironmentStatus = {
  ready: boolean;
  missing: string[];
  invalid: string[];
};

type Environment = Readonly<Record<string, string | undefined>>;

function isValidSupabaseUrl(value: string, nodeEnv: string | undefined): boolean {
  try {
    const url = new URL(value);
    const isLocalDevelopment =
      nodeEnv !== 'production' &&
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(url.hostname);

    return url.protocol === 'https:' || isLocalDevelopment;
  } catch {
    return false;
  }
}

export function inspectServerEnvironment(
  env: Environment = process.env
): ServerEnvironmentStatus {
  const missing = REQUIRED_SERVER_VARIABLES.filter(
    (name) => !env[name]?.trim()
  );
  const invalid: string[] = [];
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  if (supabaseUrl && !isValidSupabaseUrl(supabaseUrl, env.NODE_ENV)) {
    invalid.push('NEXT_PUBLIC_SUPABASE_URL');
  }

  return {
    ready: missing.length === 0 && invalid.length === 0,
    missing: [...missing],
    invalid,
  };
}
