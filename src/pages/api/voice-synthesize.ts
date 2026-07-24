import type { NextApiRequest, NextApiResponse } from 'next';
import { beginApiRequest, logApiError } from '@/lib/api-observability';
import { authenticate, verifyProfileOwnership } from '@/lib/auth-middleware';
import { consumeExternalApiQuota } from '@/lib/external-api-quota';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const requestContext = beginApiRequest(req, res, 'api.voice_synthesize');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await authenticate(req, res);
  if (!user) return;

  const { profileId, text } = req.body;

  if (typeof profileId !== 'string' || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Missing required fields: profileId and text' });
  }

  const normalizedText = text.trim();
  if (normalizedText.length > 5000) {
    return res.status(400).json({ error: 'Text must be 5000 characters or fewer' });
  }

  const isOwner = await verifyProfileOwnership(profileId, user.id, user.client, res);
  if (!isOwner) return;

  if (!process.env.ELEVENLABS_API_KEY) {
    return res.status(500).json({ error: 'ElevenLabs API key not configured' });
  }

  try {
    const { data: profile, error: profileError } = await user.client
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

    const quota = await consumeExternalApiQuota(
      user.client,
      'tts',
      normalizedText.length
    );
    if (quota.status === 'unavailable') {
      return res.status(503).json({ error: '语音额度服务暂时不可用，请稍后重试' });
    }
    if (quota.status === 'limited') {
      res.setHeader('Retry-After', String(quota.retryAfterSeconds));
      return res.status(429).json({ error: '语音生成请求已达到当前测试额度，请稍后重试' });
    }

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${profile.voice_id}`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: normalizedText,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.8,
          style_exaggeration: 0.5,
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      await logApiError(requestContext, 'elevenlabs.tts_failed', {
        providerStatus: response.status,
      });
      return res.status(502).json({ error: '声音供应商暂时无法生成语音' });
    }

    const contentType = response.headers.get('content-type') || '';
    const declaredLength = Number(response.headers.get('content-length'));
    if (
      !contentType.toLowerCase().startsWith('audio/') ||
      (Number.isFinite(declaredLength) && declaredLength > MAX_AUDIO_BYTES)
    ) {
      return res.status(502).json({ error: '声音供应商返回了无效或过大的音频' });
    }

    const audioBuffer = await response.arrayBuffer();
    if (audioBuffer.byteLength > MAX_AUDIO_BYTES) {
      return res.status(502).json({ error: '声音供应商返回了无效或过大的音频' });
    }

    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', 'attachment; filename="speech.mp3"');
    res.send(Buffer.from(audioBuffer));
  } catch (error) {
    await logApiError(requestContext, 'voice_synthesis.request_failed', {
      errorName: error instanceof Error ? error.name : 'unknown',
    });
    return res.status(500).json({ error: 'Failed to synthesize speech' });
  }
}
