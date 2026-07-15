import type { NextApiRequest, NextApiResponse } from 'next';
import { serverSupabase } from '@/lib/server-supabase';
import { authenticate, verifyProfileOwnership } from '@/lib/auth-middleware';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await authenticate(req, res);
  if (!user) return;

  const { profileId, text } = req.body;

  if (typeof profileId !== 'string' || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Missing required fields: profileId and text' });
  }

  if (text.length > 5000) {
    return res.status(400).json({ error: 'Text must be 5000 characters or fewer' });
  }

  const isOwner = await verifyProfileOwnership(profileId, user.id, res);
  if (!isOwner) return;

  if (!process.env.ELEVENLABS_API_KEY) {
    return res.status(500).json({ error: 'ElevenLabs API key not configured' });
  }

  try {
    const { data: profile, error: profileError } = await serverSupabase
      .from('memory_profiles')
      .select('voice_id')
      .eq('id', profileId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    if (!profile.voice_id) {
      return res.status(400).json({ error: 'Voice not trained for this profile' });
    }

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${profile.voice_id}`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text.trim(),
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.8,
          style_exaggeration: 0.5,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('ElevenLabs TTS error:', errorData);
      return res.status(response.status).json({ error: errorData.detail || 'Failed to synthesize speech' });
    }

    const audioBuffer = await response.arrayBuffer();
    
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', 'attachment; filename="speech.mp3"');
    res.send(Buffer.from(audioBuffer));
  } catch (error) {
    console.error('Voice synthesis error:', error);
    return res.status(500).json({ error: 'Failed to synthesize speech' });
  }
}
