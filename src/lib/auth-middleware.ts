import type { NextApiRequest, NextApiResponse } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createUserSupabase } from './user-supabase';

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  accessToken: string;
  client: SupabaseClient;
}

export async function authenticate(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<AuthenticatedUser | null> {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header' });
    return null;
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const client = createUserSupabase(token);
    const { data: { user }, error } = await client.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: 'Unauthorized: Invalid token' });
      return null;
    }

    return {
      id: user.id,
      email: user.email ?? null,
      accessToken: token,
      client,
    };
  } catch {
    res.status(401).json({ error: 'Unauthorized: Failed to authenticate' });
    return null;
  }
}

export async function verifyProfileOwnership(
  profileId: string,
  userId: string,
  client: SupabaseClient,
  res: NextApiResponse
): Promise<boolean> {
  const { data: profile, error } = await client
    .from('memory_profiles')
    .select('id')
    .eq('id', profileId)
    .eq('user_id', userId)
    .single();

  if (error || !profile) {
    res.status(403).json({ error: 'Forbidden: Profile not owned by user' });
    return false;
  }

  return true;
}
