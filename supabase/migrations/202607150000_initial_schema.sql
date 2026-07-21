CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS memory_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  relation TEXT NOT NULL,
  gender TEXT,
  birth_date DATE,
  avatar_url TEXT,
  short_description TEXT,
  voice_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memory_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_profile_id UUID NOT NULL REFERENCES memory_profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('text', 'image', 'audio', 'video', 'document')),
  title TEXT NOT NULL,
  content TEXT,
  file_url TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memory_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_profile_id UUID NOT NULL REFERENCES memory_profiles(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES memory_materials(id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL,
  embedding vector(1536),
  source_type TEXT NOT NULL CHECK (source_type IN ('text', 'image', 'audio', 'video')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_profile_id UUID NOT NULL REFERENCES memory_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  memory_profile_id UUID NOT NULL REFERENCES memory_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  retrieved_context TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_memory_profiles_user_id ON memory_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_memory_materials_profile_id ON memory_materials(memory_profile_id);
CREATE INDEX IF NOT EXISTS idx_memory_chunks_profile_id ON memory_chunks(memory_profile_id);
CREATE INDEX IF NOT EXISTS idx_conversations_profile_id ON conversations(memory_profile_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_profile_id ON messages(memory_profile_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);

CREATE TABLE IF NOT EXISTS voice_cloning_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_profile_id UUID NOT NULL REFERENCES memory_profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'success', 'failed')),
  voice_id TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS uploaded_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_profile_id UUID REFERENCES memory_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('voice_cloning', 'material')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  memory_profile_id UUID REFERENCES memory_profiles(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('data_usage', 'voice_cloning', 'privacy_policy')),
  consented BOOLEAN NOT NULL DEFAULT false,
  consented_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_cloning_jobs_profile_id ON voice_cloning_jobs(memory_profile_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_user_id ON uploaded_files(user_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_profile_id ON uploaded_files(memory_profile_id);
CREATE INDEX IF NOT EXISTS idx_consents_user_id ON consents(user_id);

ALTER TABLE memory_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own memory profiles"
  ON memory_profiles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own memory profiles"
  ON memory_profiles FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own memory profiles"
  ON memory_profiles FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own memory profiles"
  ON memory_profiles FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "Users can view materials for their own profiles"
  ON memory_materials FOR SELECT
  USING (memory_profile_id IN (SELECT id FROM memory_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can create materials for their own profiles"
  ON memory_materials FOR INSERT
  WITH CHECK (memory_profile_id IN (SELECT id FROM memory_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update materials for their own profiles"
  ON memory_materials FOR UPDATE
  USING (memory_profile_id IN (SELECT id FROM memory_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete materials for their own profiles"
  ON memory_materials FOR DELETE
  USING (memory_profile_id IN (SELECT id FROM memory_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can view chunks for their own profiles"
  ON memory_chunks FOR SELECT
  USING (memory_profile_id IN (SELECT id FROM memory_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can create chunks for their own profiles"
  ON memory_chunks FOR INSERT
  WITH CHECK (memory_profile_id IN (SELECT id FROM memory_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete chunks for their own profiles"
  ON memory_chunks FOR DELETE
  USING (memory_profile_id IN (SELECT id FROM memory_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can view their own conversations"
  ON conversations FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own conversations"
  ON conversations FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own conversations"
  ON conversations FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own conversations"
  ON conversations FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "Users can view messages for their own profiles"
  ON messages FOR SELECT
  USING (memory_profile_id IN (SELECT id FROM memory_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can create messages for their own profiles"
  ON messages FOR INSERT
  WITH CHECK (memory_profile_id IN (SELECT id FROM memory_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete messages for their own profiles"
  ON messages FOR DELETE
  USING (memory_profile_id IN (SELECT id FROM memory_profiles WHERE user_id = auth.uid()));

ALTER TABLE voice_cloning_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploaded_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own voice cloning jobs"
  ON voice_cloning_jobs FOR SELECT
  USING (memory_profile_id IN (SELECT id FROM memory_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can create their own voice cloning jobs"
  ON voice_cloning_jobs FOR INSERT
  WITH CHECK (memory_profile_id IN (SELECT id FROM memory_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their own voice cloning jobs"
  ON voice_cloning_jobs FOR UPDATE
  USING (memory_profile_id IN (SELECT id FROM memory_profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can view their own uploaded files"
  ON uploaded_files FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own uploaded files"
  ON uploaded_files FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view their own consents"
  ON consents FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own consents"
  ON consents FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_memory_profiles_updated_at
BEFORE UPDATE ON memory_profiles
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
