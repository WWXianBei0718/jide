import type { NextApiRequest, NextApiResponse } from 'next';
import { authenticate, verifyProfileOwnership } from '@/lib/auth-middleware';
import { validateMessageFeedback } from '@/lib/message-feedback';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await authenticate(req, res);
  if (!user) return;

  const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
  const profileId = req.method === 'GET' ? req.query.profileId : body.profileId;
  if (typeof profileId !== 'string' || !UUID_PATTERN.test(profileId)) {
    return res.status(400).json({ error: 'Valid profile ID is required' });
  }

  const isOwner = await verifyProfileOwnership(profileId, user.id, user.client, res);
  if (!isOwner) return;

  if (req.method === 'GET') {
    const { data, error } = await user.client
      .from('message_feedback')
      .select('message_id, verdict, reasons, note, updated_at')
      .eq('memory_profile_id', profileId)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: true });

    if (error) return res.status(500).json({ error: 'Failed to fetch message feedback' });
    return res.status(200).json(data || []);
  }

  const messageId = body.messageId;
  if (typeof messageId !== 'string' || !UUID_PATTERN.test(messageId)) {
    return res.status(400).json({ error: 'Valid message ID is required' });
  }

  const { data: message, error: messageError } = await user.client
    .from('messages')
    .select('id, role')
    .eq('id', messageId)
    .eq('memory_profile_id', profileId)
    .eq('user_id', user.id)
    .single();
  if (messageError || !message || message.role !== 'assistant') {
    return res.status(404).json({ error: 'Assistant message not found' });
  }

  if (req.method === 'POST') {
    const feedback = validateMessageFeedback({
      verdict: body.verdict,
      reasons: body.reasons,
      note: body.note,
    });
    if (!feedback) return res.status(400).json({ error: 'Invalid message feedback' });

    const updatedAt = new Date().toISOString();
    const { data, error } = await user.client
      .from('message_feedback')
      .upsert({
        user_id: user.id,
        memory_profile_id: profileId,
        message_id: messageId,
        verdict: feedback.verdict,
        reasons: feedback.reasons,
        note: feedback.note,
        updated_at: updatedAt,
      }, { onConflict: 'user_id,message_id' })
      .select('message_id, verdict, reasons, note, updated_at')
      .single();

    if (error || !data) return res.status(500).json({ error: 'Failed to save message feedback' });
    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { error } = await user.client
      .from('message_feedback')
      .delete()
      .eq('message_id', messageId)
      .eq('memory_profile_id', profileId)
      .eq('user_id', user.id);

    if (error) return res.status(500).json({ error: 'Failed to remove message feedback' });
    return res.status(204).end();
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}
