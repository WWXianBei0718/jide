import type { NextApiRequest, NextApiResponse } from 'next';
import { authenticate, verifyProfileOwnership } from '@/lib/auth-middleware';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await authenticate(req, res);
  if (!user) return;

  const { profileId } = req.query;
  if (typeof profileId !== 'string') {
    return res.status(400).json({ error: 'Profile ID is required' });
  }

  const isOwner = await verifyProfileOwnership(profileId, user.id, user.client, res);
  if (!isOwner) return;

  const { data, error } = await user.client
    .from('messages')
    .select('*')
    .eq('memory_profile_id', profileId)
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: 'Failed to fetch messages' });
  return res.status(200).json(data || []);
}
