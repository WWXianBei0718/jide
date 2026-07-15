import type { NextApiRequest, NextApiResponse } from 'next';
import { serverSupabase } from '@/lib/server-supabase';
import { authenticate, verifyProfileOwnership } from '@/lib/auth-middleware';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const user = await authenticate(req, res);
  if (!user) return;

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, user.id);
    case 'POST':
      return handlePost(req, res, user.id);
    case 'PUT':
      return handlePut(req, res, user.id);
    case 'DELETE':
      return handleDelete(req, res, user.id);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse, userId: string) {
  const { id } = req.query;

  try {
    if (id) {
      const { data: profile, error } = await serverSupabase
        .from('memory_profiles')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

      if (error || !profile) {
        return res.status(404).json({ error: 'Profile not found' });
      }

      return res.status(200).json(profile);
    } else {
      const { data: profiles, error } = await serverSupabase
        .from('memory_profiles')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json(profiles);
    }
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch profiles' });
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse, userId: string) {
  const { name, relation, gender, birth_date, short_description } = req.body;

  if (!name || !relation) {
    return res.status(400).json({ error: 'Name and relation are required' });
  }

  try {
    const { data: profile, error } = await serverSupabase
      .from('memory_profiles')
      .insert({
        user_id: userId,
        name,
        relation,
        gender: gender || null,
        birth_date: birth_date || null,
        short_description: short_description || null,
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(201).json(profile);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to create profile' });
  }
}

async function handlePut(req: NextApiRequest, res: NextApiResponse, userId: string) {
  const { id, name, relation, gender, birth_date, short_description, voice_id } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Profile ID is required' });
  }

  const isOwner = await verifyProfileOwnership(id, userId, res);
  if (!isOwner) return;

  try {
    const { data: profile, error } = await serverSupabase
      .from('memory_profiles')
      .update({
        name,
        relation,
        gender: gender || null,
        birth_date: birth_date || null,
        short_description: short_description || null,
        voice_id: voice_id || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json(profile);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update profile' });
  }
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse, userId: string) {
  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Profile ID is required' });
  }

  const isOwner = await verifyProfileOwnership(id, userId, res);
  if (!isOwner) return;

  try {
    const { error } = await serverSupabase
      .from('memory_profiles')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ message: 'Profile deleted successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete profile' });
  }
}