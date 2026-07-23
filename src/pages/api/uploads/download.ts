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
  if (mode !== 'inline' && mode !== 'download') {
    return res.status(400).json({ error: 'Invalid file delivery mode' });
  }

  const { data: file, error } = await adminSupabase
    .from('uploaded_files')
    .select('id, file_name, file_path, storage_bucket, file_type, file_size, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('status', 'ready')
    .single();

  if (error || !file) return res.status(404).json({ error: 'File not found' });

  const { data: fileBlob, error: downloadError } = await adminSupabase.storage
    .from(file.storage_bucket)
    .download(file.file_path);

  if (downloadError || !fileBlob) {
    return res.status(500).json({ error: 'Failed to read private file' });
  }
  if (fileBlob.size !== file.file_size) {
    return res.status(500).json({ error: 'Private file size verification failed' });
  }

  const buffer = Buffer.from(await fileBlob.arrayBuffer());
  const disposition = mode === 'download' ? 'attachment' : 'inline';
  res.setHeader('Content-Type', file.file_type);
  res.setHeader('Content-Length', buffer.byteLength.toString());
  res.setHeader(
    'Content-Disposition',
    `${disposition}; filename*=UTF-8''${encodeURIComponent(file.file_name)}`
  );
  return res.status(200).send(buffer);
}
