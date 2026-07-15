import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/supabase';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { data, error } = await supabase.from('memory_profiles').select('id').limit(1);
    
    if (error) {
      return res.status(500).json({ status: 'error', message: error.message });
    }
    
    return res.status(200).json({ 
      status: 'healthy', 
      database: 'connected',
      table_exists: true,
      sample_data: data?.length > 0
    });
  } catch {
    return res.status(500).json({ 
      status: 'error', 
      message: 'Database connection failed' 
    });
  }
}
