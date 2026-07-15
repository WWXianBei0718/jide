import type { NextApiRequest, NextApiResponse } from 'next';
import { authenticate, verifyProfileOwnership, type AuthenticatedUser } from '@/lib/auth-middleware';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const user = await authenticate(req, res);
  if (!user) return;

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, user);
    case 'POST':
      return handlePost(req, res, user);
    case 'PUT':
      return handlePut(req, res, user);
    case 'DELETE':
      return handleDelete(req, res, user);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse, user: AuthenticatedUser) {
  const { id } = req.query;

  try {
    if (id) {
      if (typeof id !== 'string') {
        return res.status(400).json({ error: 'Invalid profile ID' });
      }
      const { data: profile, error } = await user.client
        .from('memory_profiles')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (error || !profile) {
        return res.status(404).json({ error: 'Profile not found' });
      }

      return res.status(200).json(profile);
    } else {
      const { data: profiles, error } = await user.client
        .from('memory_profiles')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json(profiles);
    }
  } catch {
    return res.status(500).json({ error: 'Failed to fetch profiles' });
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse, user: AuthenticatedUser) {
  const { name, relation, gender, birth_date, short_description } = req.body;

  if (typeof name !== 'string' || !name.trim() || typeof relation !== 'string' || !relation.trim()) {
    return res.status(400).json({ error: 'Name and relation are required' });
  }

  if (name.length > 100 || relation.length > 100 || (typeof short_description === 'string' && short_description.length > 5000)) {
    return res.status(400).json({ error: 'Profile fields exceed the allowed length' });
  }

  try {
    const { data: profile, error } = await user.client
      .from('memory_profiles')
      .insert({
        user_id: user.id,
        name: name.trim(),
        relation: relation.trim(),
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
  } catch {
    return res.status(500).json({ error: 'Failed to create profile' });
  }
}

async function handlePut(req: NextApiRequest, res: NextApiResponse, user: AuthenticatedUser) {
  const { id, name, relation, gender, birth_date, short_description } = req.body;

  if (typeof id !== 'string' || !id) {
    return res.status(400).json({ error: 'Profile ID is required' });
  }

  const isOwner = await verifyProfileOwnership(id, user.id, user.client, res);
  if (!isOwner) return;

  const updates: Record<string, string | null> = {};
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim() || name.length > 100) {
      return res.status(400).json({ error: 'Invalid name' });
    }
    updates.name = name.trim();
  }
  if (relation !== undefined) {
    if (typeof relation !== 'string' || !relation.trim() || relation.length > 100) {
      return res.status(400).json({ error: 'Invalid relation' });
    }
    updates.relation = relation.trim();
  }
  if (gender !== undefined) updates.gender = typeof gender === 'string' && gender ? gender : null;
  if (birth_date !== undefined) updates.birth_date = typeof birth_date === 'string' && birth_date ? birth_date : null;
  if (short_description !== undefined) {
    if (typeof short_description !== 'string' || short_description.length > 5000) {
      return res.status(400).json({ error: 'Invalid short description' });
    }
    updates.short_description = short_description || null;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No supported fields to update' });
  }

  try {
    const { data: profile, error } = await user.client
      .from('memory_profiles')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json(profile);
  } catch {
    return res.status(500).json({ error: 'Failed to update profile' });
  }
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse, user: AuthenticatedUser) {
  const { id } = req.body;

  if (typeof id !== 'string' || !id) {
    return res.status(400).json({ error: 'Profile ID is required' });
  }

  const isOwner = await verifyProfileOwnership(id, user.id, user.client, res);
  if (!isOwner) return;

  try {
    const { error } = await user.client
      .from('memory_profiles')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ message: 'Profile deleted successfully' });
  } catch {
    return res.status(500).json({ error: 'Failed to delete profile' });
  }
}
