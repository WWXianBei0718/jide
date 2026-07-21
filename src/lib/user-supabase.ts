import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { serverRealtimeOptions } from './server-supabase-options';

export function createUserSupabase(accessToken: string): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase URL and anonymous key must be provided');
  }

  return createClient(supabaseUrl, anonKey, {
    ...serverRealtimeOptions,
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
