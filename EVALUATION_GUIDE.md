# 「记得」项目 - AI 评测指南

> [!WARNING]
> **历史文档，已停止作为开发依据。** 本文保留旧模型、旧接口和旧测试方法，仅用于追溯。当前事实请先阅读 [`CURRENT_STATE.md`](./CURRENT_STATE.md)，产品验收标准请阅读 [`PRODUCT_PRINCIPLES.md`](./PRODUCT_PRINCIPLES.md)。

## 快速开始

### 访问评估 API
```
GET http://localhost:3000/api/assessment
```

这个 API 返回完整的项目信息，包括：
- 技术栈
- 功能清单
- API 端点
- 数据库结构
- 评测标准
- 测试步骤

---

## 一、项目概述

### 项目名称
「记得」- 数字记忆档案与 AI 陪伴产品

### 核心价值
为最重要的人建立数字记忆档案，让爱与回忆留存。通过 AI 人格模拟和声音克隆技术实现情感陪伴。

### 技术栈
- **框架**: Next.js 15 + React + TypeScript
- **数据库**: Supabase (PostgreSQL)
- **认证**: Supabase Auth
- **AI 模型**: OpenAI GPT-5.5 / GPT-4o / GPT-3.5
- **语音服务**: ElevenLabs (TTS + 声音克隆)

---

## 二、功能清单与测试方法

### 2.1 用户认证系统

**功能描述**: 邮箱注册、登录、验证、退出

**测试方法**:
```bash
# 注册
POST /auth/v1/signup
Content-Type: application/json
{
  "email": "test@example.com",
  "password": "Password123!"
}

# 登录
POST /auth/v1/token?grant_type=password
Content-Type: application/json
{
  "email": "test@example.com",
  "password": "Password123!"
}

# 退出
POST /auth/v1/logout
```

**测试页面**: `/` (登录页)

---

### 2.2 记忆体管理

**功能描述**: 创建、查看、编辑、删除记忆体

**测试方法**:
```bash
# 创建记忆体
POST /api/profile
Content-Type: application/json
{
  "name": "测试记忆体",
  "relation": "朋友",
  "gender": "女",
  "short_description": "这是一个测试记忆体的详细描述，包含性格特点、爱好等信息。",
  "birth_date": "1990-01-01",
  "user_id": "用户ID"
}

# 获取记忆体列表
GET /api/profile?userId=用户ID

# 获取单个记忆体
GET /api/profile?profileId=记忆体ID

# 更新记忆体
PUT /api/profile
Content-Type: application/json
{
  "id": "记忆体ID",
  "short_description": "更新后的描述"
}

# 删除记忆体
DELETE /api/profile?profileId=记忆体ID
```

**测试页面**: `/dashboard`, `/create-profile`

---

### 2.3 AI 人格模拟聊天

**功能描述**: 基于记忆体描述的人格模拟聊天，支持多模型切换和参数调整

**测试方法**:
```bash
POST /api/chat
Content-Type: application/json
{
  "profileId": "记忆体ID",
  "message": "你好，最近怎么样？",
  "userId": "用户ID",
  "model": "gpt-5.5",
  "temperature": 0.7,
  "maxTokens": 2000
}
```

**模型选项**:
- `gpt-3.5` - GPT-3.5 Turbo
- `gpt-4o` - GPT-4o
- `gpt-5.5` - GPT-5.5 (默认推荐)
- `gpt-5.5-instant` - GPT-5.5 Instant
- `gpt-5.5-pro` - GPT-5.5 Pro

**测试页面**: `/chat?profileId=xxx`, `/test-eval?profileId=xxx`

---

### 2.4 声音克隆

**功能描述**: 上传音频训练克隆声音，支持 ElevenLabs IVC

**测试方法**:
```bash
POST /api/voice-clone
Content-Type: application/json
{
  "profileId": "记忆体ID",
  "userId": "用户ID",
  "audioFiles": [
    {
      "filename": "voice1.mp3",
      "content": "base64编码的音频内容"
    }
  ]
}
```

**测试页面**: `/train-voice?profileId=xxx`

---

### 2.5 语音合成

**功能描述**: 将 AI 回复转换为克隆后的语音

**测试方法**:
```bash
POST /api/voice-synthesize
Content-Type: application/json
{
  "profileId": "记忆体ID",
  "text": "你好，这是合成的语音。",
  "userId": "用户ID"
}
```

**返回**: 音频文件 (audio/mpeg)

---

### 2.6 综合自测

**功能描述**: 自动测试所有核心功能

**测试方法**:
```bash
# 访问自测页面
GET /self-test

# 健康检查 API
GET /api/health

# ElevenLabs 语音列表
GET /api/voices
```

---

## 三、API 端点完整列表

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| GET | /api/health | 健康检查 | 否 |
| GET | /api/voices | ElevenLabs 语音列表 | 否 |
| GET | /api/assessment | 项目评估信息 | 否 |
| POST | /api/profile | 创建记忆体 | 是 |
| GET | /api/profile | 获取记忆体 | 是 |
| PUT | /api/profile | 更新记忆体 | 是 |
| DELETE | /api/profile | 删除记忆体 | 是 |
| POST | /api/chat | AI 聊天 | 是 |
| POST | /api/voice-clone | 声音克隆 | 是 |
| POST | /api/voice-synthesize | 语音合成 | 是 |

---

## 四、数据库结构

### memory_profiles 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 主键 |
| user_id | uuid | 用户 ID |
| name | text | 姓名 |
| relation | text | 关系 |
| gender | text | 性别 |
| birth_date | date | 出生日期 |
| short_description | text | 详细描述（3000字） |
| voice_id | text | ElevenLabs voice_id |
| created_at | timestamp | 创建时间 |

### memory_materials 表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid | 主键 |
| memory_profile_id | uuid | 关联记忆体 |
| type | text | 资料类型 |
| content | text | 内容 |
| file_url | text | 文件 URL |

---

## 五、评测标准

### 5.1 功能完整性 (100分)

| 维度 | 分值 | 评测要点 |
|------|------|----------|
| 认证系统 | 20 | 注册、登录、验证、退出是否正常 |
| 记忆体管理 | 20 | CRUD 操作是否完整 |
| AI 聊天 | 20 | 人格模拟、多模型、参数调整 |
| 声音克隆 | 20 | 音频上传、训练、合成 |
| 测试评估 | 20 | 自测、模型对比、评分系统 |

### 5.2 技术架构 (100分)

| 维度 | 分值 | 评测要点 |
|------|------|----------|
| 架构设计 | 25 | 分层、模块化、扩展性 |
| 代码质量 | 25 | 可读性、类型安全、错误处理 |
| 安全性 | 25 | RLS、API Key 保护、输入验证 |
| 性能 | 25 | 缓存、加载状态、响应速度 |

### 5.3 用户体验 (100分)

| 维度 | 分值 | 评测要点 |
|------|------|----------|
| 界面设计 | 25 | 美观度、一致性、视觉层级 |
| 交互流畅 | 25 | 无卡顿、无屏闪、动画自然 |
| 错误处理 | 25 | 友好提示、异常恢复 |
| 响应式 | 25 | 移动端适配 |

### 5.4 项目完整度评分

| 分数范围 | 评级 | 说明 |
|----------|------|------|
| 90-100 | A | 优秀，可直接发布 |
| 80-89 | B | 良好，需要少量优化 |
| 70-79 | C | 中等，需要较多改进 |
| 60-69 | D | 及格，核心功能可用 |
| <60 | F | 不及格，需要重写 |

---

## 六、测试步骤

### 步骤 1: 启动服务器
```bash
cd /Users/doufu/Documents/Trae/remember_01
npm run dev
```

### 步骤 2: 检查基础服务
```bash
# 健康检查
curl http://localhost:3000/api/health

# 获取项目评估信息
curl http://localhost:3000/api/assessment

# 获取 ElevenLabs 语音列表
curl http://localhost:3000/api/voices
```

### 步骤 3: 创建测试用户
访问 `http://localhost:3000` 注册新用户

### 步骤 4: 创建测试记忆体
```bash
POST http://localhost:3000/api/profile
{
  "name": "张三",
  "relation": "朋友",
  "gender": "男",
  "short_description": "张三是一个开朗乐观的人，喜欢音乐和旅行。他总是乐于助人，朋友们都很喜欢他。",
  "birth_date": "1990-05-15",
  "user_id": "测试用户ID"
}
```

### 步骤 5: 测试 AI 聊天
```bash
POST http://localhost:3000/api/chat
{
  "profileId": "记忆体ID",
  "message": "你好，我很想念你",
  "userId": "用户ID",
  "model": "gpt-5.5"
}
```

### 步骤 6: 运行综合自测
访问 `http://localhost:3000/self-test`

### 步骤 7: 评估项目
根据评测标准打分，输出详细评测报告

---

## 七、项目文件结构

```
/Users/doufu/Documents/Trae/remember_01/
├── .env.local                    # 环境变量
├── supabase/schema.sql           # 数据库表结构
├── src/
│   ├── lib/supabase.ts           # Supabase 客户端
│   ├── hooks/useAuth.ts          # 认证 Hook
│   ├── pages/
│   │   ├── index.tsx             # 登录页
│   │   ├── dashboard.tsx         # 仪表盘
│   │   ├── create-profile.tsx    # 创建记忆体
│   │   ├── chat.tsx              # 聊天页
│   │   ├── train-voice.tsx       # 声音训练
│   │   ├── test-eval.tsx         # 模型测试
│   │   ├── self-test.tsx         # 综合自测
│   │   └── api/
│   │       ├── chat.ts           # AI 聊天 API
│   │       ├── profile.ts        # 记忆体 CRUD
│   │       ├── voice-clone.ts    # 声音克隆
│   │       ├── voice-synthesize.ts # 语音合成
│   │       ├── health.ts         # 健康检查
│   │       ├── voices.ts         # 语音列表
│   │       └── assessment.ts     # 项目评估
└── EVALUATION_GUIDE.md           # 评测指南
```

---

## 八、评测报告模板

请按照以下模板输出评测报告：

```markdown
# 「记得」项目评测报告

## 一、评测概览
- 评测日期: YYYY-MM-DD
- 评测版本: 1.0.0
- 评测环境: localhost:3000

## 二、功能测试结果

### 2.1 用户认证
- 注册: ✅/❌ 说明
- 登录: ✅/❌ 说明
- 验证: ✅/❌ 说明
- 退出: ✅/❌ 说明

### 2.2 记忆体管理
- 创建: ✅/❌ 说明
- 查看: ✅/❌ 说明
- 更新: ✅/❌ 说明
- 删除: ✅/❌ 说明

### 2.3 AI 聊天
- 人格模拟: ✅/❌ 说明
- 多模型切换: ✅/❌ 说明
- 参数调整: ✅/❌ 说明

### 2.4 声音克隆
- 音频上传: ✅/❌ 说明
- 声音训练: ✅/❌ 说明
- 语音合成: ✅/❌ 说明

### 2.5 综合自测
- 自测页面: ✅/❌ 说明
- 健康检查: ✅/❌ 说明

## 三、评分

| 维度 | 得分 | 满分 | 百分比 |
|------|------|------|--------|
| 功能完整性 | | 100 | |
| 技术架构 | | 100 | |
| 用户体验 | | 100 | |
| **总分** | | **300** | |

## 四、优点

1. ...
2. ...

## 五、问题与建议

1. ...
2. ...

## 六、改进建议

1. ...
2. ...

## 七、结论

- 评级: A/B/C/D/F
- 建议: ...
```

---

## 九、参考链接

| 资源 | 链接 |
|------|------|
| 项目代码 | `/Users/doufu/Documents/Trae/remember_01/` |
| 评估 API | `http://localhost:3000/api/assessment` |
| 综合自测 | `http://localhost:3000/self-test` |
| 项目文档 | `/Users/doufu/Documents/Trae/remember_01/PROJECT_ASSESSMENT.md` |
| 评测指南 | `/Users/doufu/Documents/Trae/remember_01/EVALUATION_GUIDE.md` |
