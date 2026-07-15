import type { NextApiRequest, NextApiResponse } from 'next';
import { authenticate } from '@/lib/auth-middleware';
import { adminSupabase } from '@/lib/admin-supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await authenticate(req, res);
  if (!user) return;

  const { id, mode } = req.query;
  if (typeof id !== 'string') return res.status(400).json({ error: 'File ID is required' });

  const { data: file, error } = await adminSupabase
    .from('uploaded_files')
    .select('id, file_name, file_path, storage_bucket, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('status', 'ready')
    .single();

  if (error || !file) return res.status(404).json({ error: 'File not found' });

  const downloadOptions = mode === 'download' ? { download: file.file_name } : undefined;
  const { data: signed, error: signedError } = await adminSupabase.storage
    .from(file.storage_bucket)
    .createSignedUrl(file.file_path, 60, downloadOptions);

  if (signedError || !signed) return res.status(500).json({ error: 'Failed to authorize download' });

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ url: signed.signedUrl, expiresIn: 60 });
}
