export interface MemoryProfile {
  id: string;
  user_id: string;
  name: string;
  relation: string;
  gender: string | null;
  birth_date: string | null;
  avatar_url: string | null;
  short_description: string | null;
  voice_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemoryMaterial {
  id: string;
  memory_profile_id: string;
  type: 'text' | 'image' | 'audio' | 'video' | 'document';
  title: string;
  content: string | null;
  file_url: string | null;
  uploaded_file_id?: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface MemoryChunk {
  id: string;
  memory_profile_id: string;
  material_id: string;
  chunk_text: string;
  embedding: number[] | string | null;
  source_type: 'text' | 'image' | 'audio' | 'video' | 'document';
  chunk_index: number;
  embedding_model: string;
  content_hash: string;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  memory_profile_id: string;
  user_id: string;
  title: string;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string | null;
  memory_profile_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  retrieved_context: string | null;
  created_at: string;
}

export interface User {
  id: string;
  email: string | undefined;
  email_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}
