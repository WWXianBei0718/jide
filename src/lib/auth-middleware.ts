import type { NextApiRequest, NextApiResponse } from 'next';
import { serverSupabase } from './server-supabase';

export interface AuthenticatedRequest extends NextApiRequest {
  user?: {
    id: string;
    email: string | null;
  };
}

export async function authenticate(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<{ id: string; email: string | null } | null> {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header' });
    return null;
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const { data: { user }, error } = await serverSupabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: 'Unauthorized: Invalid token' });
      return null;
    }

    return {
      id: user.id,
      email: user.email ?? null,
    };
  } catch {
    res.status(401).json({ error: 'Unauthorized: Failed to authenticate' });
    return null;
  }
}

export async function verifyProfileOwnership(
  profileId: string,
  userId: string,
  res: NextApiResponse
): Promise<boolean> {
  const { data: profile, error } = await serverSupabase
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
