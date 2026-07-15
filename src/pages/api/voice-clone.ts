import type { NextApiRequest, NextApiResponse } from 'next';
import { serverSupabase } from '@/lib/server-supabase';
import { authenticate, verifyProfileOwnership } from '@/lib/auth-middleware';

interface AudioFilePayload {
  filename: string;
  content: string;
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb',
    },
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await authenticate(req, res);
  if (!user) return;

  const { profileId, audioFiles } = req.body;

  if (typeof profileId !== 'string' || !Array.isArray(audioFiles) || audioFiles.length === 0) {
    return res.status(400).json({ error: 'Missing required fields: profileId and audioFiles' });
  }

  if (audioFiles.length > 10 || !audioFiles.every((file): file is AudioFilePayload =>
    typeof file?.filename === 'string' && file.filename.length > 0 && file.filename.length <= 255 &&
    typeof file?.content === 'string' && file.content.length > 0
  )) {
    return res.status(400).json({ error: 'Invalid audio files' });
  }

  const totalEncodedSize = audioFiles.reduce((total, file) => total + file.content.length, 0);
  if (totalEncodedSize > 20 * 1024 * 1024) {
    return res.status(413).json({ error: 'Audio files are too large' });
  }

  const isOwner = await verifyProfileOwnership(profileId, user.id, res);
  if (!isOwner) return;

  if (!process.env.ELEVENLABS_API_KEY) {
    return res.status(500).json({ error: 'ElevenLabs API key not configured' });
  }

  try {
    const { data: profile, error: profileError } = await serverSupabase
      .from('memory_profiles')
      .select('name')
      .eq('id', profileId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const formData = new FormData();
    formData.append('name', `${profile.name} 的声音`);
    
    audioFiles.forEach((file, index) => {
      const buffer = Buffer.from(file.content, 'base64');
      const blob = new Blob([buffer]);
      formData.append(`files[${index}]`, blob, file.filename);
    });

    const response = await fetch('https://api.elevenlabs.io/v1/voices/ivc/create', {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
      },
      body: formData as unknown as BodyInit,
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('ElevenLabs API error:', data);
      return res.status(response.status).json({ error: data.detail || 'Failed to create voice clone' });
    }

    if (data.voice_id) {
      const { error: updateError } = await serverSupabase
        .from('memory_profiles')
        .update({ voice_id: data.voice_id })
        .eq('id', profileId)
        .eq('user_id', user.id);

      if (updateError) {
        console.error('Failed to save cloned voice ID:', updateError);
        return res.status(500).json({ error: 'Voice was created but could not be saved to the profile' });
      }
    }

    return res.status(200).json({
      voice_id: data.voice_id,
      name: data.name,
      message: '语音克隆创建成功',
    });
  } catch (error) {
    console.error('Voice clone error:', error);
    return res.status(500).json({ error: 'Failed to create voice clone' });
  }
}
