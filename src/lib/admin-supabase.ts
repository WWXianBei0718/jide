import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { serverRealtimeOptions } from './server-supabase-options';

let adminInstance: SupabaseClient | undefined;

function initAdminSupabase(): SupabaseClient {
  if (adminInstance) return adminInstance;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase URL and service role key must be provided');
  }

  adminInstance = createClient(supabaseUrl, serviceRoleKey, {
    ...serverRealtimeOptions,
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return adminInstance;
}

export const adminSupabase = new Proxy(
  {},
  {
    get(_, prop) {
      const client = initAdminSupabase();
      const value = Reflect.get(client, prop);
      return typeof value === 'function' ? value.bind(client) : value;
    },
  }
) as SupabaseClient;
