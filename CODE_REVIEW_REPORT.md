# 「记得」项目代码审查报告

> [!WARNING]
> **历史审查快照。** 当前实现和验证结果请以 [`CURRENT_STATE.md`](./CURRENT_STATE.md) 与实际代码为准。

> 审查日期：2026-07-07
> 审查范围：代码级验真 + 安全加固 + MVP 修复规划

---

## 一、API 路由真实性检查

### 1.1 当前存在的 API 路由

| API 路径 | 文件路径 | 请求方法 | 需要登录 | 真实调用 Supabase | 真实调用 OpenAI | 真实调用 ElevenLabs | 使用 mock | 错误处理 | 输入校验 |
|----------|----------|----------|----------|------------------|------------------|---------------------|-----------|----------|----------|
| `/api/health` | `src/pages/api/health.ts` | GET | 否 | ✅ 是 | - | - | ❌ | ✅ | ❌ |
| `/api/voices` | `src/pages/api/voices.ts` | GET | **否** | - | - | ✅ 是 | ❌ | ✅ | ❌ |
| `/api/assessment` | `src/pages/api/assessment.ts` | GET | 否 | - | - | - | ✅ 完全静态 | - | - |
| `/api/chat` | `src/pages/api/chat.ts` | POST | 否 | ✅ 是 | ✅ 是 | - | ❌ | ✅ | ✅ |
| `/api/voice-clone` | `src/pages/api/voice-clone.ts` | POST | 否 | ✅ 是 | - | ✅ 是 | ❌ | ✅ | ✅ |
| `/api/voice-synthesize` | `src/pages/api/voice-synthesize.ts` | POST | 否 | ✅ 是 | - | ✅ 是 | ❌ | ✅ | ✅ |

### 1.2 缺失的 API 路由

**严重问题**：`assessment.ts` 文档声称存在以下接口，但实际不存在：

| API 路径 | 请求方法 | 说明 |
|----------|----------|------|
| `/api/profile` | POST | 创建记忆体 |
| `/api/profile` | GET | 获取记忆体 |
| `/api/profile` | PUT | 更新记忆体 |
| `/api/profile` | DELETE | 删除记忆体 |

**现状**：记忆体的 CRUD 操作目前在前端直接调用 Supabase，没有通过 API 路由。

---

## 二、认证与用户隔离检查（高危）

### 2.1 发现的问题

| 问题类型 | 严重程度 | 涉及接口 | 描述 |
|----------|----------|----------|------|
| 前端传入 userId 直接使用 | **高危** | `/api/chat`, `/api/voice-clone`, `/api/voice-synthesize` | 后端没有从 Supabase Auth token 获取用户，而是直接信任前端传入的 `userId` |
| API 无登录验证 | **高危** | 所有 API | 任何未登录用户都可以调用这些接口 |
| 用户隔离缺失 | **高危** | `/api/chat`, `/api/voice-clone`, `/api/voice-synthesize` | 没有验证 profileId 是否属于当前用户 |
| `/api/voices` 公开访问 | **高危** | `/api/voices` | 任何人都可以获取 ElevenLabs 账号下的所有语音列表 |

### 2.2 具体安全风险

**1. `/api/chat`**（第 12-16 行）：
```typescript
const { profileId, message, userId, model = 'gpt-5.5', temperature = 0.7, maxTokens = 2000 } = req.body;

if (!profileId || !message || !userId) {
  return res.status(400).json({ error: 'Missing required fields' });
}
```
- 直接使用 `userId`，没有验证是否为当前登录用户
- 用户可以传入任意 `profileId` 和 `userId` 访问他人数据

**2. `/api/voice-clone`**（第 12-16 行）：
```typescript
const { profileId, audioFiles, userId } = req.body;

if (!profileId || !audioFiles || !userId || audioFiles.length === 0) {
  return res.status(400).json({ error: 'Missing required fields' });
}
```
- 同样直接信任前端传入的 `userId`

**3. `/api/voice-synthesize`**（第 12-16 行）：
```typescript
const { profileId, text, userId } = req.body;

if (!profileId || !text || !userId) {
  return res.status(400).json({ error: 'Missing required fields' });
}
```
- 同样存在信任前端 `userId` 的问题

### 2.3 修复方案

**核心原则**：后端必须从 Supabase Auth token 获取当前用户，而非前端传入的 `userId`。

```typescript
// 推荐方案：在 API 路由中验证用户
import { supabase } from '@/lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { data: { user }, error } = await supabase.auth.getUser(req.headers.authorization?.replace('Bearer ', ''));
  
  if (error || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // 使用 user.id 作为可信用户 ID
  const userId = user.id;
  
  // 验证 profileId 是否属于当前用户
  const { data: profile } = await supabase
    .from('memory_profiles')
    .select('id')
    .eq('id', profileId)
    .eq('user_id', userId)
    .single();
  
  if (!profile) {
    return res.status(403).json({ error: 'Forbidden: Profile not owned by user' });
  }
  
  // 继续业务逻辑...
}
```

---

## 三、Supabase RLS 检查

### 3.1 RLS 配置状态

| 表名 | RLS 启用 | 策略存在 | 策略有效性 |
|------|----------|----------|------------|
| `memory_profiles` | ✅ ENABLE | ✅ SELECT/INSERT/UPDATE/DELETE | ✅ 使用 `user_id = auth.uid()` |
| `memory_materials` | ✅ ENABLE | ✅ SELECT/INSERT/UPDATE/DELETE | ✅ 关联校验 |
| `memory_chunks` | ✅ ENABLE | ✅ SELECT/INSERT/DELETE | ✅ 关联校验 |
| `conversations` | ✅ ENABLE | ✅ SELECT/INSERT/UPDATE/DELETE | ✅ 使用 `user_id = auth.uid()` |
| `messages` | ✅ ENABLE | ✅ SELECT/INSERT/DELETE | ✅ 关联校验 |

### 3.2 关键发现

**现状**：`supabase/schema.sql` 中定义了完整的 RLS 策略，配置合理。

**潜在问题**：
1. **RLS 策略是否在数据库中实际执行**：需要确认 SQL 是否已在 Supabase 控制台执行
2. **前端直接调用 Supabase**：Dashboard 和 CreateProfile 页面直接使用 Supabase client 操作数据库，依赖 anon key 和 RLS 保护
3. **API 路由没有使用服务端认证**：当前 API 路由使用的是同一个 `supabase` 实例（anon key），没有使用服务端认证

### 3.3 服务端 Supabase 客户端问题

`src/lib/supabase.ts` 使用的是 `NEXT_PUBLIC_SUPABASE_ANON_KEY`：

```typescript
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
```

**问题**：在 API 路由中使用 anon key 时，Supabase 不会自动注入 `auth.uid()`，导致 RLS 策略可能无法正常工作。

**修复方案**：创建服务端专用的 Supabase 客户端，使用 `SUPABASE_SERVICE_ROLE_KEY` 或在请求中传递 JWT。

```typescript
// lib/server-supabase.ts
import { createClient } from '@supabase/supabase-js';

export const serverSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

---

## 四、ElevenLabs 相关检查

### 4.1 检查结果

| 检查项 | 状态 | 描述 |
|--------|------|------|
| `/api/voices` 返回所有 voice | ✅ 是 | 直接调用 ElevenLabs API 返回完整列表 |
| `/api/voices` 无认证 | **❌ 高危** | 任何人都可以访问 |
| 可能泄露其他用户 voice_id | **❌ 高危** | voice_id 没有与用户绑定 |
| voice_id 与用户/profile 绑定 | ❌ 否 | 仅保存在 memory_profiles 表中，没有关联验证 |
| `/api/voice-clone` 真实调用 IVC | ✅ 是 | 使用 `https://api.elevenlabs.io/v1/voices/ivc/create` |
| 返回并保存真实 voice_id | ✅ 是 | 更新 memory_profiles.voice_id |
| `/api/voice-synthesize` 真实调用 TTS | ✅ 是 | 使用 `https://api.elevenlabs.io/v1/text-to-speech/{voice_id}` |
| 返回 audio/mpeg | ✅ 是 | 设置正确的 Content-Type |
| 错误处理 | ✅ 有 | 处理 API 错误和网络异常 |
| 记录 voice cloning 状态 | ❌ 否 | 没有 voice_cloning_jobs 表 |

### 4.2 临时方案标记

**确认**：当前使用 base64 JSON 上传音频是临时方案。

**推荐正式方案**：
1. 前端上传音频到 Supabase Storage
2. 数据库创建 `uploaded_files` 记录
3. 后端读取文件后调用 ElevenLabs
4. 保存 voice_id
5. 创建 `voice_cloning_jobs` 表记录状态（pending/processing/success/failed）
6. `/api/voices` 只返回当前用户已绑定的 voice

---

## 五、OpenAI / 模型调用检查

### 5.1 检查结果

| 检查项 | 状态 | 描述 |
|--------|------|------|
| `/api/chat` 真实调用 OpenAI | ✅ 是 | 使用 `https://api.openai.com/v1/chat/completions` |
| 有 mock 回复 | ❌ 否 | 所有回复来自真实 API |
| 模型 ID 映射 | **⚠️ 部分问题** | 见下文 |
| temperature/max_tokens | ✅ 有 | 可配置 |
| prompt 注入防护 | ❌ 否 | 没有专门防护 |
| AI 声称"我就是逝者本人" | ❌ 否 | 系统提示中有边界说明 |
| 安全边界声明 | ✅ 有 | "你是记忆助手，不是逝者本人" |

### 5.2 模型 ID 问题

当前模型映射（`chat.ts` 第 18-26 行）：

```typescript
const modelMap: Record<string, string> = {
  'gpt-3.5': 'gpt-3.5-turbo',   // ✅ 有效
  'gpt-4': 'gpt-4o',            // ✅ 有效
  'gpt-4o': 'gpt-4o',           // ✅ 有效
  'gpt-5': 'gpt-5',             // ❌ 无效
  'gpt-5.5': 'gpt-5.5',         // ❌ 无效
  'gpt-5.5-instant': 'chat-latest', // ⚠️ 不确定
  'gpt-5.5-pro': 'gpt-5.5-pro', // ❌ 无效
};
```

**问题**：`gpt-5`、`gpt-5.5`、`gpt-5.5-pro` 不是 OpenAI API 的有效模型名称。

**修复方案**：建立 displayName 到 realModelId 的映射：

```typescript
const modelMap: Record<string, string> = {
  'gpt-3.5': 'gpt-3.5-turbo',
  'gpt-4': 'gpt-4o',
  'gpt-4o': 'gpt-4o',
  'gpt-4o-mini': 'gpt-4o-mini',
  'gpt-5': 'gpt-4o',           // 降级映射
  'gpt-5.5': 'gpt-4o',         // 降级映射
  'gpt-5.5-instant': 'gpt-4o-mini', // 降级映射
  'gpt-5.5-pro': 'gpt-4o',     // 降级映射
};
```

---

## 六、数据库结构完整性检查

### 6.1 当前已有的表（schema.sql）

| 表名 | 状态 | 说明 |
|------|------|------|
| `memory_profiles` | ✅ 已定义 | 记忆体基本信息 |
| `memory_materials` | ✅ 已定义 | 记忆资料 |
| `memory_chunks` | ✅ 已定义 | 文本切片和向量 |
| `conversations` | ✅ 已定义 | 对话会话 |
| `messages` | ✅ 已定义 | 消息记录 |

### 6.2 缺失的表

| 表名 | MVP 必须 | 描述 |
|------|----------|------|
| `voice_cloning_jobs` | **✅ 必须** | 记录声音克隆状态（pending/processing/success/failed） |
| `uploaded_files` | **✅ 必须** | 记录用户上传的音频和材料文件 |
| `consents` | **✅ 必须** | 记录用户确认其有权上传和使用相关资料 |
| `audit_logs` | ❌ 后置 | 操作审计日志 |

### 6.3 需要补充的 SQL

```sql
-- voice_cloning_jobs 表
CREATE TABLE IF NOT EXISTS voice_cloning_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_profile_id UUID NOT NULL REFERENCES memory_profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'success', 'failed')),
  voice_id TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE voice_cloning_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own voice cloning jobs"
  ON voice_cloning_jobs FOR SELECT
  USING (memory_profile_id IN (SELECT id FROM memory_profiles WHERE user_id = auth.uid()));

-- uploaded_files 表
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

ALTER TABLE uploaded_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own uploaded files"
  ON uploaded_files FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own uploaded files"
  ON uploaded_files FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- consents 表
CREATE TABLE IF NOT EXISTS consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  memory_profile_id UUID REFERENCES memory_profiles(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('data_usage', 'voice_cloning', 'privacy_policy')),
  consented BOOLEAN NOT NULL DEFAULT false,
  consented_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own consents"
  ON consents FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own consents"
  ON consents FOR INSERT
  WITH CHECK (user_id = auth.uid());
```

---

## 七、人格模拟质量检查

### 7.1 当前实现

**确认**：当前人格模拟只是把 `short_description` 放进 prompt。

**系统提示结构**（`chat.ts` 第 61-97 行）：
- 姓名、关系、性别
- short_description
- memory_materials 中的 content

**评估**：Demo 级方案，缺少深度人格特征。

### 7.2 升级方案

| 特征维度 | 说明 | 当前支持 |
|----------|------|----------|
| 人物基础档案 | 姓名、性别、年龄、关系、职业 | ✅ 部分 |
| 重要生活事件 | 关键人生节点、成就、挑战 | ❌ |
| 说话习惯 | 语速、用词风格、口头禅 | ❌ |
| 常用口头禅 | 特定短语、语气词 | ❌ |
| 关系记忆 | 与用户的过往经历、共同回忆 | ❌ |
| 禁忌话题 | 敏感话题、不愿提及的内容 | ❌ |
| 价值观 | 信仰、原则、人生态度 | ❌ |
| 回忆素材 | 照片、音频、文档内容 | ⚠️ 部分（memory_materials） |
| RAG 记忆检索 | 基于向量的记忆检索 | ❌ |

### 7.3 下一步建议

1. **扩展 memory_profiles 表**：增加 `personality_traits`、`speaking_style`、`catchphrases`、`taboo_topics`、`values` 等字段
2. **实现 RAG 检索**：使用 pgvector 进行语义检索，在对话时动态检索相关记忆
3. **优化 prompt 结构**：将人格特征结构化地注入系统提示

---

## 八、前端页面检查

### 8.1 页面清单

| 页面路径 | 文件 | 是否可用 | Loading 状态 | 错误提示 | 空状态 | 移动端适配 |
|----------|------|----------|--------------|----------|--------|------------|
| `/` | `index.tsx` | ✅ 可用 | ✅ | ✅ | - | ✅ |
| `/dashboard` | `dashboard.tsx` | ✅ 可用 | ✅ | ⚠️ 仅 console | ✅ | ✅ |
| `/create-profile` | `create-profile.tsx` | ✅ 可用 | ✅ | ✅ | - | ✅ |
| `/chat?profileId=xxx` | `chat.tsx` | ✅ 可用 | ✅ | ⚠️ 仅 console | ✅ | ✅ |
| `/train-voice?profileId=xxx` | `train-voice.tsx` | ✅ 可用 | ✅ | ✅ | - | ✅ |
| `/test-eval?profileId=xxx` | `test-eval.tsx` | ✅ 可用 | ✅ | ⚠️ 仅 console | - | ✅ |
| `/self-test` | `self-test.tsx` | ✅ 可用 | ✅ | ✅ | - | ✅ |
| `/profile/[id]` | `profile/[id].tsx` | ✅ 可用 | ✅ | ⚠️ 仅 console | ✅ | ✅ |
| `/profile/[id]/chat` | `profile/[id]/chat.tsx` | ✅ 可用 | ✅ | ⚠️ 仅 console | ✅ | ✅ |
| `/profile/[id]/materials` | `profile/[id]/materials.tsx` | ⚠️ 未检查 | - | - | - | - |
| `/test-chat` | `test-chat.tsx` | ✅ 可用 | ✅ | ⚠️ 仅 console | - | ✅ |

### 8.2 问题发现

1. **profile/[id].tsx 引用不存在的字段**（第 104-110 行）：
   ```typescript
   {profile.death_date && (...) }  // death_date 字段不存在于 memory_profiles 表
   ```

2. **train-voice.tsx 存在 useState 误用**（第 34-36 行）：
   ```typescript
   useState(() => {
     fetchProfile();
   }, [fetchProfile]);
   ```
   应该使用 `useEffect` 而不是 `useState`。

3. **部分页面缺少错误提示**：错误仅输出到 console，用户看不到

---

## 九、环境变量与密钥检查

### 9.1 检查结果

| 检查项 | 状态 | 描述 |
|--------|------|------|
| `.env` 提交到 git | ❌ 否 | 不存在 .env 文件 |
| `.env.local` 加入 .gitignore | ✅ 是 | 第 3 行：`.env.local` |
| OpenAI API Key 只在服务端使用 | ✅ 是 | 无 NEXT_PUBLIC_ 前缀 |
| ElevenLabs API Key 只在服务端使用 | ✅ 是 | 无 NEXT_PUBLIC_ 前缀 |
| Supabase service role key 暴露 | ❌ 否 | 未配置 |
| NEXT_PUBLIC_ 前缀误用 | ❌ 否 | 无敏感密钥暴露 |
| `.env.example` 文件 | **❌ 缺失** | 需要生成 |

### 9.2 当前 .env.local 配置

```
NEXT_PUBLIC_SUPABASE_URL=https://swerahhzqbfarsdcmdqb.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_BmkzhYJGRSn1WNaxDqO4qA_ygbh6FU9
OPENAI_API_KEY=[REDACTED_ROTATED_KEY]
ELEVENLABS_API_KEY=sk_xxxxxxxxxxxxxxxxxxxxxxxx
```

### 9.3 需要补充的环境变量

| 变量名 | 用途 | 是否必需 |
|--------|------|----------|
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端专用 Supabase 密钥 | **✅ 必需** |

---

## 十、自测页面增强

### 10.1 当前自测页面分析

**文件**：`src/pages/self-test.tsx`

**当前测试项**：
1. ✅ 认证初始化
2. ✅ Supabase 连接（/api/health）
3. ✅ OpenAI API（/api/chat）
4. ✅ ElevenLabs API（/api/voices）
5. ❌ 创建记忆体（测试/api/profile，但该接口不存在）

### 10.2 问题

1. **测试创建记忆体失败**：`/api/profile` 接口不存在，测试必然失败
2. **使用伪造的 userId**（第 44-48 行）：
   ```typescript
   body: JSON.stringify({
     profileId: 'test',
     message: '你好',
     userId: 'test',  // 伪造的用户 ID
     model: 'gpt-3.5-turbo',
   }),
   ```
3. **缺少完整的 CRUD 测试**：没有测试读取、更新、删除记忆体
4. **缺少语音合成测试**：没有测试 `/api/voice-synthesize`
5. **缺少真实登录测试**：没有验证真实用户会话

### 10.3 建议增强的测试项

| 测试项 | 描述 | API |
|--------|------|-----|
| 真实用户认证 | 使用真实登录会话 | Supabase Auth |
| 创建记忆体 | 创建测试记忆体 | POST /api/profile |
| 读取记忆体 | 读取当前用户的记忆体列表 | GET /api/profile |
| 更新记忆体 | 更新测试记忆体 | PUT /api/profile |
| 删除记忆体 | 删除测试记忆体 | DELETE /api/profile |
| OpenAI 聊天 | 真实对话测试 | POST /api/chat |
| ElevenLabs 语音列表 | 检查语音服务 | GET /api/voices |
| 语音合成 | 测试 TTS 功能 | POST /api/voice-synthesize |
| 错误处理 | 测试错误场景 | 各 API |

---

## 十一、明确结论

### 11.1 项目完成度评分

**综合评分：55/100**

| 维度 | 评分 | 说明 |
|------|------|------|
| 认证安全 | 20/40 | 有基础认证，但 API 路由缺少权限校验 |
| RLS | 30/30 | schema.sql 配置完整，策略合理 |
| 真实 API 调用 | 25/25 | OpenAI 和 ElevenLabs 都是真实调用 |
| 声音流程 | 20/30 | 缺少状态管理和文件存储 |
| 聊天记忆质量 | 10/30 | Demo 级人格模拟，缺少 RAG |
| UI 完整性 | 25/30 | 页面基本可用，缺少部分交互细节 |

### 11.2 当前状态

| 检查项 | 状态 |
|--------|------|
| 是否存在 mock 数据 | ✅ 是（assessment.ts 完全静态） |
| 是否能跑通真实核心链路 | ⚠️ 部分 |
| 是否适合给真实用户内测 | ❌ 否 |

### 11.3 最高风险 Top 10

| 排名 | 风险 | 严重程度 | 影响 |
|------|------|----------|------|
| 1 | API 路由信任前端传入的 userId | **高危** | 用户可以访问他人数据 |
| 2 | `/api/voices` 无认证公开访问 | **高危** | 泄露 ElevenLabs 账号所有语音 |
| 3 | API 路由没有验证用户登录状态 | **高危** | 任何人都可以调用 API |
| 4 | `/api/profile` 接口不存在 | **高** | 文档与实际不符 |
| 5 | 模型 ID 不正确（gpt-5.5 等） | **高** | API 调用可能失败 |
| 6 | 缺少服务端 Supabase 客户端 | **高** | RLS 在 API 路由中可能不生效 |
| 7 | 缺少 voice_cloning_jobs 表 | **高** | 无法跟踪克隆状态 |
| 8 | 音频使用 base64 上传 | **中** | 大文件可能失败 |
| 9 | 缺少 consents 表 | **中** | 法律合规风险 |
| 10 | 自测页面测试项不完整 | **中** | 无法全面验证功能 |

### 11.4 必须立即修复的问题

**优先级：认证安全 > RLS > 真实 API 调用**

1. **立即修复**：API 路由从 Supabase Auth token 获取用户，不再信任前端传入的 userId
2. **立即修复**：为所有需要认证的 API 添加登录验证
3. **立即修复**：修复模型 ID 映射，移除不存在的模型
4. **立即修复**：创建 `/api/profile` 接口，替代前端直接调用 Supabase
5. **立即修复**：创建服务端专用 Supabase 客户端

### 11.5 可以后置的问题

1. 实现完整的 RAG 记忆检索
2. 扩展人格特征字段
3. 创建 audit_logs 表
4. UI 美化和交互细节优化
5. 添加照片、视频上传功能

### 11.6 下一步开发优先级

```
第一阶段（必须完成，才能内测）：
├── 1. API 路由认证修复
│   ├── 从 Supabase Auth token 获取用户
│   ├── 添加登录验证中间件
│   └── 验证 profile 归属权
├── 2. 创建 /api/profile 接口
│   ├── POST /api/profile（创建）
│   ├── GET /api/profile（列表）
│   ├── PUT /api/profile（更新）
│   └── DELETE /api/profile（删除）
├── 3. 创建服务端 Supabase 客户端
├── 4. 修复模型 ID 映射
└── 5. 创建 voice_cloning_jobs 和 uploaded_files 表

第二阶段（核心链路稳定）：
├── 1. 实现音频上传到 Supabase Storage
├── 2. 添加 consents 表和同意流程
├── 3. 修复前端页面问题（death_date、useState 误用）
├── 4. 增强自测页面测试项
└── 5. 生成 .env.example 文件

第三阶段（体验优化）：
├── 1. 实现 RAG 记忆检索
├── 2. 扩展人格特征字段
├── 3. 添加聊天记录持久化
└── 4. UI 细节优化
```

---

## 附录：文件修改清单

### 需要创建的文件

| 文件 | 说明 |
|------|------|
| `src/pages/api/profile.ts` | 记忆体 CRUD API |
| `src/lib/server-supabase.ts` | 服务端专用 Supabase 客户端 |
| `.env.example` | 环境变量示例文件 |

### 需要修改的文件

| 文件 | 修改内容 |
|------|----------|
| `src/pages/api/chat.ts` | 从 Auth token 获取用户，验证 profile 归属 |
| `src/pages/api/voice-clone.ts` | 从 Auth token 获取用户，验证 profile 归属 |
| `src/pages/api/voice-synthesize.ts` | 从 Auth token 获取用户，验证 profile 归属 |
| `src/pages/api/voices.ts` | 添加认证，只返回当前用户绑定的 voice |
| `src/pages/api/chat.ts` | 修复模型 ID 映射 |
| `src/pages/train-voice.tsx` | 修复 useState 误用为 useEffect |
| `src/pages/profile/[id].tsx` | 移除不存在的 death_date 字段引用 |
| `src/pages/self-test.tsx` | 更新测试项，使用真实 API |
| `supabase/schema.sql` | 添加 voice_cloning_jobs、uploaded_files、consents 表 |
