import type { NextApiRequest, NextApiResponse } from 'next';
import { beginApiRequest, logApiError } from '@/lib/api-observability';
import { authenticate } from '@/lib/auth-middleware';

interface VoiceReadyProfile {
  id: string;
  name: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const requestContext = beginApiRequest(req, res, 'api.voices');
  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await authenticate(req, res);
  if (!user) return;

  try {
    const { data, error } = await user.client
      .from('memory_profiles')
      .select('id, name')
      .eq('user_id', user.id)
      .not('voice_id', 'is', null);

    if (error) {
      await logApiError(requestContext, 'voices.fetch_failed', {
        outcome: 'database_error',
      });
      return res.status(500).json({ error: 'Failed to fetch user voice status' });
    }

    const profiles = (data || []) as VoiceReadyProfile[];
    return res.status(200).json({
      count: profiles.length,
      profiles: profiles.map((profile) => ({
        profileId: profile.id,
        profileName: profile.name,
        ready: true,
      })),
    });
  } catch (error) {
    await logApiError(requestContext, 'voices.request_failed', {
      errorName: error instanceof Error ? error.name : 'unknown',
    });
    return res.status(500).json({ error: 'Failed to fetch user voice status' });
  }
}
