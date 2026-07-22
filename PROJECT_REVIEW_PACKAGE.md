# 「记得」项目技术审查材料包

> [!WARNING]
> **历史审查快照。** 当前实现和验证结果请以 [`CURRENT_STATE.md`](./CURRENT_STATE.md) 与实际代码为准。

> 版本: 1.0.0 | 状态: Alpha | 日期: 2026-07-10

---

## 1. 项目简介

### 1.1 项目目标

「记得」是一个面向逝者纪念、家庭记忆保存和 AI 陪伴交互的产品。核心目标是通过数字技术帮助用户留存珍贵记忆，延续永恒思念。

### 1.2 核心用户流程

```
用户注册登录 → 创建记忆体(数字人物) → 上传人物资料 → 声音克隆 → 与记忆体聊天 → 语音合成对话
```

### 1.3 现阶段定位

当前为 **Alpha 版本**，已实现核心功能的基础框架，包括：
- 用户认证系统
- 记忆体管理（创建/查看/编辑/删除）
- AI 人格模拟聊天
- ElevenLabs 声音克隆与语音合成

---

## 2. 技术架构

### 2.1 架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端 (Next.js)                           │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐         │
│  │ 登录页  │ │ Dashboard│ │ 创建记忆体│ │ 聊天/语音   │         │
│  └────┬────┘ └────┬─────┘ └────┬─────┘ └──────┬──────┘         │
│       │           │            │              │                 │
└───────┼───────────┼────────────┼──────────────┼─────────────────┘
        │           │            │              │
        ▼           ▼            ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API 路由层 (Next.js)                       │
│  /api/profile    /api/chat    /api/voice-clone    /api/voices   │
└───────┬───────────┬────────────┬──────────────┬─────────────────┘
        │           │            │              │
        ▼           ▼            ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     外部服务层                                  │
│  ┌──────────────┐ ┌─────────────┐ ┌───────────────────────┐     │
│  │ Supabase     │ │ OpenAI GPT  │ │ ElevenLabs Voice API  │     │
│  │ (Auth/DB/    │ │ 人格模拟    │ │ (声音克隆/TTS)        │     │
│  │ Storage)     │ │            │ │                       │     │
│  └──────────────┘ └─────────────┘ └───────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 前端

| 项目 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js | 15.x |
| 语言 | TypeScript | 5.6.x |
| UI 框架 | Tailwind CSS | 3.4.x |
| 状态管理 | React Hooks | 18.2.x |
| 路由 | Next.js Router | - |

### 2.3 后端

项目采用 **Next.js API Routes** 作为轻量级后端，无需独立后端服务：

| 项目 | 说明 |
|------|------|
| 服务器运行时 | Node.js 20.x |
| API 架构 | RESTful |
| 认证中间件 | 自定义 JWT 验证 |
| Supabase 客户端 | @supabase/supabase-js |

### 2.4 数据库

| 项目 | 技术 |
|------|------|
| 数据库类型 | PostgreSQL (Supabase) |
| 向量存储 | pgvector |
| 行级安全 | Supabase RLS |
| 文件存储 | Supabase Storage |

### 2.5 登录鉴权

| 项目 | 说明 |
|------|------|
| 认证方案 | Supabase Auth |
| 登录方式 | 邮箱/密码 |
| 验证方式 | 邮箱验证链接 |
| Token 管理 | JWT |
| 状态同步 | onAuthStateChange 监听 |

### 2.6 文件存储

- **服务**: Supabase Storage
- **用途**: 头像、音频文件、资料文档
- **访问控制**: RLS 策略控制

### 2.7 OpenAI 调用

| 项目 | 说明 |
|------|------|
| API 端点 | https://api.openai.com/v1/chat/completions |
| 模型映射 | gpt-5.5 → gpt-4o, gpt-3.5 → gpt-3.5-turbo |
| 当前默认 | gpt-4o |
| 调用位置 | /api/chat |

### 2.8 ElevenLabs 调用

| 项目 | 说明 |
|------|------|
| 声音克隆 | POST /v1/voices/ivc/create |
| 语音合成 | POST /v1/text-to-speech/{voice_id} |
| 获取声音列表 | GET /v1/voices |
| 调用位置 | /api/voice-clone, /api/voice-synthesize, /api/voices |

### 2.9 部署方式

| 环境 | 部署平台 |
|------|----------|
| 开发 | 本地 (next dev) |
| 生产 | Vercel + Supabase Cloud |

### 2.10 数据流

```
用户操作 → 前端组件 → API Route → 外部服务/数据库 → 返回结果 → 前端渲染
```

---

## 3. 目录结构

```
remember_01/
├── src/
│   ├── hooks/                 # React Hooks
│   │   └── useAuth.ts         # 认证状态管理
│   ├── lib/                   # 核心库
│   │   ├── auth-middleware.ts # 认证中间件
│   │   ├── server-supabase.ts # 服务端 Supabase 客户端
│   │   └── supabase.ts        # 客户端 Supabase 客户端
│   ├── pages/                 # 页面路由
│   │   ├── api/               # API 路由
│   │   │   ├── assessment.ts  # 项目评估信息
│   │   │   ├── chat.ts        # AI 聊天接口
│   │   │   ├── health.ts      # 健康检查
│   │   │   ├── profile.ts     # 记忆体 CRUD
│   │   │   ├── voice-clone.ts # 声音克隆
│   │   │   ├── voice-synthesize.ts # 语音合成
│   │   │   └── voices.ts      # 声音列表
│   │   ├── profile/           # 记忆体详情页
│   │   │   ├── [id]/          # 动态路由
│   │   │   │   ├── chat.tsx   # 聊天页面
│   │   │   │   └── materials.tsx # 资料管理
│   │   │   └── [id].tsx       # 记忆体详情
│   │   ├── _app.tsx           # 应用入口
│   │   ├── _document.tsx      # 文档模板
│   │   ├── chat.tsx           # 聊天页
│   │   ├── create-profile.tsx # 创建记忆体
│   │   ├── dashboard.tsx      # 仪表盘
│   │   ├── index.tsx          # 登录页
│   │   ├── self-test.tsx      # 综合自测
│   │   ├── test-chat.tsx      # 测试聊天
│   │   ├── test-eval.tsx      # 模型评估
│   │   └── train-voice.tsx    # 声音训练
│   ├── styles/
│   │   └── globals.css        # 全局样式
│   └── types/
│       └── index.ts           # TypeScript 类型定义
├── supabase/
│   └── schema.sql             # 数据库表结构与 RLS
├── .env.example               # 环境变量模板
├── .env.local                 # 本地环境变量 (gitignore)
├── CODE_REVIEW_REPORT.md      # 代码审查报告
├── EVALUATION_GUIDE.md        # 评估指南
├── PROJECT_ASSESSMENT.md      # 项目评估
├── next.config.js             # Next.js 配置
├── tailwind.config.js         # Tailwind 配置
├── postcss.config.js          # PostCSS 配置
├── tsconfig.json              # TypeScript 配置
└── package.json               # 依赖管理
```

---

## 4. 已实现功能清单

| 功能模块 | 状态 | 说明 | 是否接真实 API |
|----------|------|------|---------------|
| 用户注册 | ✅ 已完成 | 邮箱注册 + 验证链接 | ✅ Supabase Auth |
| 用户登录 | ✅ 已完成 | 邮箱密码登录 | ✅ Supabase Auth |
| 用户登出 | ✅ 已完成 | 清除会话 | ✅ Supabase Auth |
| 创建记忆体 | ✅ 已完成 | 创建数字人物档案 | ✅ Supabase DB |
| 查看记忆体列表 | ✅ 已完成 | Dashboard 展示 | ✅ Supabase DB |
| 查看记忆体详情 | ✅ 已完成 | 个人页面 | ✅ Supabase DB |
| 更新记忆体 | ✅ 已完成 | 编辑资料 | ✅ Supabase DB |
| 删除记忆体 | ✅ 已完成 | 删除档案 | ✅ Supabase DB |
| AI 聊天 | ✅ 已完成 | 人格模拟对话 | ✅ OpenAI API |
| 声音克隆 | ✅ 已完成 | 上传音频训练克隆声 | ✅ ElevenLabs |
| 语音合成 | ✅ 已完成 | 文本转语音 | ✅ ElevenLabs |
| 获取声音列表 | ✅ 已完成 | 用户克隆声音列表 | ✅ ElevenLabs |
| 健康检查 | ✅ 已完成 | 数据库连接检查 | ✅ |
| 项目评估 API | ✅ 已完成 | 返回项目信息 | ❌ 静态数据 |
| 综合自测页面 | ✅ 已完成 | 功能测试界面 | ⚠️ 部分完成 |
| 模型评估页面 | ✅ 已完成 | 多模型对比测试 | ✅ OpenAI API |
| 资料上传 | ⚠️ 部分完成 | 页面存在，后端未完整 | ❌ |
| 历史记录保存 | ❌ 未完成 | 对话历史存储 | ❌ |
| 音频播放 | ⚠️ 部分完成 | 基础播放功能 | ⚠️ |

---

## 5. 核心业务流程

### 5.1 用户注册登录

```
1. 用户访问登录页 → 输入邮箱密码
2. 调用 supabase.auth.signInWithPassword / signUp
3. 注册后发送验证邮件 → 用户点击链接验证
4. 验证成功后跳转到 Dashboard
5. 监听 onAuthStateChange 保持状态同步
```

### 5.2 创建数字人物

```
1. 点击「创建记忆体」→ 进入表单页
2. 填写姓名、关系、性别、出生日期、详细描述
3. 调用 supabase.from('memory_profiles').insert()
4. 成功后跳转到 Dashboard
```

### 5.3 上传人物资料

⚠️ **当前状态**: 页面存在但后端 API 未完整实现

### 5.4 上传音频

```
1. 进入声音训练页面
2. 选择音频文件 → 转换为 base64
3. 调用 /api/voice-clone API
4. 上传到 ElevenLabs 创建克隆声音
```

### 5.5 声音克隆

```
1. API 接收 profileId 和 audioFiles
2. 验证用户权限
3. 调用 ElevenLabs /v1/voices/ivc/create
4. 获取 voice_id → 更新 memory_profiles 表
5. 返回 voice_id
```

### 5.6 人格资料整理

```
记忆体创建时存储：姓名、关系、性别、出生日期、详细描述(3000字)
聊天时读取这些信息作为 prompt 的上下文
```

### 5.7 用户发送消息

```
1. 聊天页面输入消息
2. 获取用户 token
3. 调用 POST /api/chat
4. 传递 profileId 和 message
```

### 5.8 AI 生成回复

```
1. 验证用户身份和 profile 归属
2. 查询记忆体信息和相关资料
3. 构建系统 prompt (包含人格描述)
4. 调用 OpenAI chat/completions API
5. 返回 AI 回复内容
```

### 5.9 语音合成

```
1. 调用 POST /api/voice-synthesize
2. 查询记忆体的 voice_id
3. 调用 ElevenLabs text-to-speech API
4. 返回 MP3 音频流
```

### 5.10 音频播放

⚠️ **当前状态**: 基础播放功能存在，但未完整集成到聊天流程

### 5.11 历史记录保存

❌ **当前状态**: 未实现。数据库表 `conversations` 和 `messages` 已创建，但 API 和前端未实现

---

## 6. API 清单

### 6.1 认证相关（Supabase Auth）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /auth/v1/signup | 用户注册 |
| POST | /auth/v1/token | 用户登录 |
| POST | /auth/v1/logout | 用户登出 |

### 6.2 自定义 API

| 方法 | 路径 | 输入参数 | 返回结果 | 权限校验 | 错误处理 |
|------|------|----------|----------|----------|----------|
| GET | /api/health | 无 | { status, database, table_exists, sample_data } | 无 | ✅ |
| GET | /api/assessment | 无 | 项目评估信息(JSON) | 无 | ✅ |
| GET | /api/profile | id (可选) | 记忆体列表或单个记忆体 | ✅ JWT | ✅ |
| POST | /api/profile | name, relation, gender, birth_date, short_description | 创建的记忆体 | ✅ JWT | ✅ |
| PUT | /api/profile | id, name, relation, ... | 更新的记忆体 | ✅ JWT + 归属验证 | ✅ |
| DELETE | /api/profile | id | { message } | ✅ JWT + 归属验证 | ✅ |
| POST | /api/chat | profileId, message, model, temperature, maxTokens | { content, model } | ✅ JWT + 归属验证 | ✅ |
| POST | /api/voice-clone | profileId, audioFiles | { voice_id, name, message } | ✅ JWT + 归属验证 | ✅ |
| POST | /api/voice-synthesize | profileId, text | MP3 音频流 | ✅ JWT + 归属验证 | ✅ |
| GET | /api/voices | 无 | 用户克隆声音列表 | ✅ JWT | ✅ |

---

## 7. 数据库结构

### 7.1 表清单

| 表名 | 用途 | RLS |
|------|------|-----|
| memory_profiles | 记忆体档案 | ✅ 已启用 |
| memory_materials | 记忆体资料（文本/图片/音频等） | ✅ 已启用 |
| memory_chunks | 资料切片（用于 RAG 检索） | ✅ 已启用 |
| conversations | 对话会话 | ✅ 已启用 |
| messages | 聊天消息 | ✅ 已启用 |
| voice_cloning_jobs | 声音克隆任务 | ✅ 已启用 |
| uploaded_files | 上传文件记录 | ✅ 已启用 |
| consents | 用户同意记录 | ✅ 已启用 |

### 7.2 表结构详细

#### memory_profiles

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PRIMARY KEY | 主键 |
| user_id | UUID | NOT NULL, REFERENCES auth.users(id) | 创建者用户ID |
| name | TEXT | NOT NULL | 姓名 |
| relation | TEXT | NOT NULL | 与用户关系 |
| gender | TEXT | NULL | 性别 |
| birth_date | DATE | NULL | 出生日期 |
| avatar_url | TEXT | NULL | 头像URL |
| short_description | TEXT | NULL | 详细描述(3000字) |
| voice_id | TEXT | NULL | ElevenLabs声音ID |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT NOW() | 更新时间 |

#### memory_materials

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PRIMARY KEY | 主键 |
| memory_profile_id | UUID | NOT NULL, REFERENCES memory_profiles(id) | 关联记忆体 |
| type | TEXT | NOT NULL, CHECK IN('text','image','audio','video','document') | 资料类型 |
| title | TEXT | NOT NULL | 标题 |
| content | TEXT | NULL | 文本内容 |
| file_url | TEXT | NULL | 文件URL |
| metadata | JSONB | NULL | 元数据 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |

#### memory_chunks

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PRIMARY KEY | 主键 |
| memory_profile_id | UUID | NOT NULL, REFERENCES memory_profiles(id) | 关联记忆体 |
| material_id | UUID | NOT NULL, REFERENCES memory_materials(id) | 关联资料 |
| chunk_text | TEXT | NOT NULL | 文本切片内容 |
| embedding | vector(1536) | NULL | OpenAI嵌入向量 |
| source_type | TEXT | NOT NULL, CHECK IN('text','image','audio','video') | 来源类型 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |

#### conversations

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PRIMARY KEY | 主键 |
| memory_profile_id | UUID | NOT NULL, REFERENCES memory_profiles(id) | 关联记忆体 |
| user_id | UUID | NOT NULL, REFERENCES auth.users(id) | 用户ID |
| title | TEXT | NOT NULL | 对话标题 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |

#### messages

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PRIMARY KEY | 主键 |
| conversation_id | UUID | REFERENCES conversations(id) | 关联对话 |
| memory_profile_id | UUID | NOT NULL, REFERENCES memory_profiles(id) | 关联记忆体 |
| user_id | UUID | NOT NULL, REFERENCES auth.users(id) | 用户ID |
| role | TEXT | NOT NULL, CHECK IN('user','assistant','system') | 角色 |
| content | TEXT | NOT NULL | 消息内容 |
| retrieved_context | TEXT | NULL | 检索到的上下文 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |

#### voice_cloning_jobs

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PRIMARY KEY | 主键 |
| memory_profile_id | UUID | NOT NULL, REFERENCES memory_profiles(id) | 关联记忆体 |
| status | TEXT | NOT NULL, CHECK IN('pending','processing','success','failed') | 任务状态 |
| voice_id | TEXT | NULL | 生成的声音ID |
| error_message | TEXT | NULL | 错误信息 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT NOW() | 更新时间 |

#### uploaded_files

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PRIMARY KEY | 主键 |
| memory_profile_id | UUID | REFERENCES memory_profiles(id) | 关联记忆体 |
| user_id | UUID | NOT NULL, REFERENCES auth.users(id) | 用户ID |
| file_name | TEXT | NOT NULL | 文件名 |
| file_path | TEXT | NOT NULL | 文件路径 |
| file_type | TEXT | NOT NULL | 文件类型 |
| file_size | BIGINT | NOT NULL | 文件大小 |
| purpose | TEXT | NOT NULL, CHECK IN('voice_cloning','material') | 用途 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |

#### consents

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PRIMARY KEY | 主键 |
| user_id | UUID | NOT NULL, REFERENCES auth.users(id) | 用户ID |
| memory_profile_id | UUID | REFERENCES memory_profiles(id) | 关联记忆体 |
| consent_type | TEXT | NOT NULL, CHECK IN('data_usage','voice_cloning','privacy_policy') | 同意类型 |
| consented | BOOLEAN | NOT NULL DEFAULT false | 是否已同意 |
| consented_at | TIMESTAMP | NULL | 同意时间 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |

### 7.3 表关系

```
auth.users
    └── memory_profiles (user_id)
            ├── memory_materials (memory_profile_id)
            │       └── memory_chunks (material_id, memory_profile_id)
            ├── conversations (memory_profile_id, user_id)
            │       └── messages (conversation_id, memory_profile_id, user_id)
            ├── voice_cloning_jobs (memory_profile_id)
            ├── uploaded_files (memory_profile_id, user_id)
            └── consents (memory_profile_id, user_id)
```

### 7.4 RLS 策略

所有表均已启用行级安全策略，核心规则：

| 表 | 策略 | 规则 |
|----|------|------|
| memory_profiles | SELECT/INSERT/UPDATE/DELETE | user_id = auth.uid() |
| memory_materials | SELECT/INSERT/UPDATE/DELETE | memory_profile_id 属于当前用户 |
| memory_chunks | SELECT/INSERT/DELETE | memory_profile_id 属于当前用户 |
| conversations | SELECT/INSERT/UPDATE/DELETE | user_id = auth.uid() |
| messages | SELECT/INSERT/DELETE | memory_profile_id 属于当前用户 |
| voice_cloning_jobs | SELECT/INSERT/UPDATE | memory_profile_id 属于当前用户 |
| uploaded_files | SELECT/INSERT | user_id = auth.uid() |
| consents | SELECT/INSERT | user_id = auth.uid() |

### 7.5 数据安全风险

| 风险 | 等级 | 说明 |
|------|------|------|
| RLS 配置 | ⚠️ 中等 | 已配置但需确保所有表都有完整策略 |
| Service Role Key | 🔴 高 | 存储在环境变量中，需确保不泄露 |
| JWT 验证 | ⚠️ 中等 | 依赖 supabase.auth.getUser() |
| API 密钥 | 🔴 高 | OpenAI/ElevenLabs 密钥需妥善管理 |

---

## 8. 环境变量清单

| 变量名 | 用途 | 是否必须 | 当前配置状态 |
|--------|------|----------|--------------|
| NEXT_PUBLIC_SUPABASE_URL | Supabase 项目 URL | ✅ 必须 | ✅ 已配置 |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase 匿名访问密钥 | ✅ 必须 | ✅ 已配置 |
| SUPABASE_SERVICE_ROLE_KEY | Supabase 服务端密钥 | ✅ 必须 | ✅ 已配置 |
| OPENAI_API_KEY | OpenAI API 密钥 | ✅ 必须 | ✅ 已配置 |
| ELEVENLABS_API_KEY | ElevenLabs API 密钥 | ✅ 必须 | ✅ 已配置 |

---

## 9. 外部服务

### 9.1 OpenAI

| 项目 | 说明 |
|------|------|
| API 端点 | https://api.openai.com/v1/chat/completions |
| 当前模型 | gpt-4o (默认), gpt-3.5-turbo |
| 模型映射 | gpt-5.5 → gpt-4o, gpt-5 → gpt-4o |
| 调用位置 | src/pages/api/chat.ts |
| 失败处理 | 返回友好错误信息，记录日志 |
| 费用风险 | 按 token 计费，需监控使用量 |
| 安全风险 | API 密钥需妥善管理 |

### 9.2 ElevenLabs

| 项目 | 说明 |
|------|------|
| API 端点 | https://api.elevenlabs.io/v1 |
| 声音克隆 | /voices/ivc/create |
| 语音合成 | /text-to-speech/{voice_id} |
| 获取声音 | /voices |
| 调用位置 | src/pages/api/voice-clone.ts, voice-synthesize.ts, voices.ts |
| 失败处理 | 返回友好错误信息，记录日志 |
| 费用风险 | 声音克隆和 TTS 均按用量计费 |
| 安全风险 | API 密钥需妥善管理 |

### 9.3 Supabase

| 项目 | 说明 |
|------|------|
| 服务类型 | PostgreSQL 数据库 + Auth + Storage |
| 项目 URL | https://swerahhzqbfarsdcmdqb.supabase.co |
| 认证方式 | 邮箱/密码 + JWT |
| 文件存储 | Supabase Storage |
| 行级安全 | RLS 已启用 |
| 向量扩展 | pgvector 已启用 |
| 调用位置 | src/lib/supabase.ts, src/lib/server-supabase.ts |
| 失败处理 | 返回友好错误信息 |
| 费用风险 | 免费额度有限，超出后计费 |

---

## 10. 当前问题清单

### 10.1 阻断问题

| 编号 | 问题描述 | 位置 | 影响 |
|------|----------|------|------|
| B01 | 对话历史记录未实现 | 全局 | 用户无法查看历史对话 |
| B02 | 资料上传功能未完整实现 | /pages/profile/[id]/materials.tsx | 无法上传和管理记忆体资料 |

### 10.2 高风险问题

| 编号 | 问题描述 | 位置 | 风险等级 |
|------|----------|------|----------|
| H01 | Service Role Key 存储在环境变量中 | .env.local | 🔴 泄露风险 |
| H02 | API 密钥在服务器端直接使用 | api/*.ts | 🔴 需确保不暴露 |
| H03 | 缺少 API 请求频率限制 | api/*.ts | 🔴 可能被滥用 |
| H04 | 缺少输入内容验证和过滤 | api/chat.ts | 🔴 注入风险 |

### 10.3 中风险问题

| 编号 | 问题描述 | 位置 | 风险等级 |
|------|----------|------|----------|
| M01 | 前端直接调用 Supabase | create-profile.tsx, dashboard.tsx | ⚠️ 绕过 API 路由 |
| M02 | 声音克隆文件大小限制未处理 | api/voice-clone.ts | ⚠️ 可能超时 |
| M03 | 缺少错误边界处理 | 全局 | ⚠️ 用户体验 |
| M04 | 缺少加载状态反馈 | 部分页面 | ⚠️ 用户体验 |

### 10.4 低风险问题

| 编号 | 问题描述 | 位置 | 风险等级 |
|------|----------|------|----------|
| L01 | 页面设计未使用专业组件库 | 全局 | 🟡 美观度 |
| L02 | 缺少响应式设计优化 | 全局 | 🟡 移动端体验 |
| L03 | 缺少深色模式 | 全局 | 🟡 用户体验 |

### 10.5 体验优化项

| 编号 | 优化项 | 说明 |
|------|--------|------|
| UX01 | 聊天界面优化 | 添加消息时间戳、头像显示 |
| UX02 | 声音训练进度 | 添加上传进度条和训练状态 |
| UX03 | 记忆体搜索 | Dashboard 添加搜索功能 |
| UX04 | 键盘快捷键 | 聊天页面添加发送快捷键 |

---

## 11. 待开发功能

### 11.1 核心功能

- [ ] 对话历史记录保存和展示
- [ ] 资料上传和管理（文本/图片/音频/视频）
- [ ] RAG 检索增强生成（使用 pgvector）
- [ ] 音频播放集成到聊天流程

### 11.2 安全增强

- [ ] API 请求频率限制
- [ ] 输入内容验证和过滤
- [ ] 敏感信息脱敏处理
- [ ] HTTPS 强制（生产环境）

### 11.3 用户体验

- [ ] 消息时间戳显示
- [ ] 聊天界面美化
- [ ] 响应式设计优化
- [ ] 深色模式支持

### 11.4 性能优化

- [ ] 数据缓存策略
- [ ] 图片压缩和懒加载
- [ ] API 响应缓存

---

## 12. 测试说明

### 12.1 启动项目

```bash
# 进入项目目录
cd remember_01

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 访问地址
http://localhost:3000
```

### 12.2 注册账号

1. 访问 http://localhost:3000
2. 点击「还没有账号？注册」
3. 输入邮箱和密码
4. 检查邮箱验证链接
5. 点击验证链接后自动登录

### 12.3 登录

1. 访问 http://localhost:3000
2. 输入已注册的邮箱和密码
3. 点击「登录」
4. 成功后跳转到 Dashboard

### 12.4 创建人物

1. 在 Dashboard 点击「创建记忆体」
2. 填写：姓名、关系、性别、出生日期、详细描述
3. 点击「创建记忆体」
4. 返回 Dashboard 查看新创建的记忆体

### 12.5 上传音频

1. 进入记忆体详情页
2. 点击「声音训练」或访问 /train-voice
3. 选择音频文件（建议 3-5 个，总时长 1-3 分钟）
4. 点击上传

### 12.6 声音克隆

1. 上传音频文件后
2. 系统自动调用 ElevenLabs API 创建克隆声音
3. 创建成功后 voice_id 会保存到记忆体

### 12.7 聊天

1. 进入记忆体详情页
2. 点击「聊天」
3. 输入消息并发送
4. AI 会根据记忆体描述进行人格模拟回复

### 12.8 生成语音

1. 在聊天页面
2. 点击语音合成按钮
3. 系统调用 ElevenLabs 将 AI 回复转换为语音
4. 播放合成的音频

### 12.9 验证数据库数据

```bash
# 检查记忆体表
curl -H "Authorization: Bearer <TOKEN>" http://localhost:3000/api/profile

# 检查健康状态
curl http://localhost:3000/api/health

# 检查项目评估信息
curl http://localhost:3000/api/assessment
```

### 12.10 查看错误日志

开发服务器运行时，日志会输出到控制台：

- API 错误会输出 `console.error`
- 网络请求错误会在前端控制台显示
- Supabase 操作错误会在前端页面显示友好提示

---

## 附录

### A. 项目版本信息

| 组件 | 版本 |
|------|------|
| Next.js | 15.x |
| React | 18.2.x |
| TypeScript | 5.6.x |
| Tailwind CSS | 3.4.x |
| Supabase SDK | 2.45.x |

### B. 技术审查要点

1. **安全性**: 检查 API 密钥管理、RLS 策略、输入验证
2. **完整性**: 检查功能实现程度、边界情况处理
3. **性能**: 检查 API 响应时间、数据库查询优化
4. **可维护性**: 检查代码结构、类型定义、错误处理
5. **合规性**: 检查用户数据隐私、服务条款同意机制
