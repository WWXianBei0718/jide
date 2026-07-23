import type { NextApiRequest, NextApiResponse } from 'next';
import { adminSupabase } from '@/lib/admin-supabase';
import { inspectServerEnvironment } from '@/lib/environment';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'no-store');

  if (!inspectServerEnvironment().ready) {
    return res.status(503).json({
      status: 'unavailable',
      database: 'not_checked',
    });
  }

  try {
    const { error } = await adminSupabase
      .from('memory_profiles')
      .select('id', { count: 'exact', head: true });

    if (error) {
      return res.status(503).json({
        status: 'unavailable',
        database: 'unavailable',
      });
    }

    return res.status(200).json({
      status: 'ready',
      database: 'connected',
    });
  } catch {
    return res.status(503).json({
      status: 'unavailable',
      database: 'unavailable',
    });
  }
}
