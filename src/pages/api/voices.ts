import type { NextApiRequest, NextApiResponse } from 'next';
import { serverSupabase } from '@/lib/server-supabase';
import { authenticate } from '@/lib/auth-middleware';

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await authenticate(req, res);
  if (!user) return;

  if (!process.env.ELEVENLABS_API_KEY) {
    return res.status(500).json({ error: 'ElevenLabs API key not configured' });
  }

  try {
    const { data: profiles, error: profilesError } = await serverSupabase
      .from('memory_profiles')
      .select('voice_id, name')
      .eq('user_id', user.id)
      .not('voice_id', 'is', null);

    if (profilesError) {
      console.error('Failed to fetch profiles:', profilesError);
      return res.status(500).json({ error: 'Failed to fetch user voices' });
    }

    const userVoiceIds = profiles?.map((p: { voice_id: string }) => p.voice_id) || [];

    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch voices' });
    }

    const data = await response.json() as { voices?: ElevenLabsVoice[] };

    const filteredVoices = data.voices?.filter((v: { voice_id: string }) => 
      userVoiceIds.includes(v.voice_id)
    ) || [];

    return res.status(200).json({
      count: filteredVoices.length,
      voices: filteredVoices.map((v) => ({
        id: v.voice_id,
        name: v.name,
        category: v.category,
      })),
      userProfiles: profiles?.map((p: { voice_id: string; name: string }) => ({
        profileName: p.name,
        voiceId: p.voice_id,
      })) || [],
    });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch voices' });
  }
}
