import { createClient, SupabaseClient } from '@supabase/supabase-js'

let supabaseInstance: SupabaseClient | undefined

function initServerSupabase(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl) {
    throw new Error('Supabase URL and API key must be provided')
  }

  const apiKey = supabaseServiceRoleKey || supabaseAnonKey
  if (!apiKey) {
    throw new Error('Supabase URL and API key must be provided')
  }

  supabaseInstance = createClient(supabaseUrl, apiKey)
  return supabaseInstance
}

export const serverSupabase = new Proxy(
  {},
  {
    get(_, prop) {
      const client = initServerSupabase()
      return Reflect.get(client, prop)
    },
  }
) as SupabaseClient
