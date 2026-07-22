# 「记得」项目文件清单

> [!WARNING]
> **历史文件清单。** 目录已发生变化；当前实现和验证结果请以 [`CURRENT_STATE.md`](./CURRENT_STATE.md) 与实际代码为准。

> 版本: 1.0.0 | 状态: Alpha | 日期: 2026-07-10

---

## 项目根目录

| 文件路径 | 文件用途 | 是否核心 | 是否需重点审查 | 已知问题 |
|----------|----------|----------|----------------|----------|
| `.env.example` | 环境变量模板 | ✅ 核心 | ✅ 是 | 无 |
| `.env.local` | 本地环境变量 | ✅ 核心 | ✅ 是 | 包含真实密钥(已 gitignore) |
| `.gitignore` | Git 忽略配置 | ✅ 核心 | ✅ 是 | 无 |
| `CODE_REVIEW_REPORT.md` | 代码审查报告 | ⚠️ 重要 | ⚠️ 建议 | 无 |
| `EVALUATION_GUIDE.md` | 评估指南 | ⚠️ 重要 | ⚠️ 建议 | 无 |
| `LICENSE` | 许可证 | 🟡 一般 | ❌ 否 | 无 |
| `PROJECT_ASSESSMENT.md` | 项目评估 | ⚠️ 重要 | ⚠️ 建议 | 无 |
| `PROJECT_REVIEW_PACKAGE.md` | 技术审查材料包 | ✅ 核心 | ✅ 是 | 无 |
| `PROJECT_FILE_INDEX.md` | 文件清单 | ✅ 核心 | ✅ 是 | 无 |
| `next-env.d.ts` | Next.js 类型定义 | 🟡 一般 | ❌ 否 | 无 |
| `next.config.js` | Next.js 配置 | ✅ 核心 | ✅ 是 | 无 |
| `package.json` | 依赖管理 | ✅ 核心 | ✅ 是 | 无 |
| `package-lock.json` | 依赖版本锁定 | ✅ 核心 | ⚠️ 建议 | 无 |
| `postcss.config.js` | PostCSS 配置 | 🟡 一般 | ❌ 否 | 无 |
| `tailwind.config.js` | Tailwind CSS 配置 | ✅ 核心 | ✅ 是 | 无 |
| `tsconfig.json` | TypeScript 配置 | ✅ 核心 | ✅ 是 | 无 |

---

## src/hooks/

| 文件路径 | 文件用途 | 是否核心 | 是否需重点审查 | 已知问题 |
|----------|----------|----------|----------------|----------|
| `useAuth.ts` | 认证状态管理 Hook | ✅ 核心 | ✅ 是 | 无 |

---

## src/lib/

| 文件路径 | 文件用途 | 是否核心 | 是否需重点审查 | 已知问题 |
|----------|----------|----------|----------------|----------|
| `auth-middleware.ts` | 认证中间件 | ✅ 核心 | ✅ 是 | 无 |
| `server-supabase.ts` | 服务端 Supabase 客户端 | ✅ 核心 | ✅ 是 | 无 |
| `supabase.ts` | 客户端 Supabase 客户端 | ✅ 核心 | ✅ 是 | 无 |

---

## src/pages/

| 文件路径 | 文件用途 | 是否核心 | 是否需重点审查 | 已知问题 |
|----------|----------|----------|----------------|----------|
| `_app.tsx` | 应用入口 | ✅ 核心 | ✅ 是 | 无 |
| `_document.tsx` | 文档模板 | 🟡 一般 | ❌ 否 | 无 |
| `chat.tsx` | 聊天页面 | ✅ 核心 | ✅ 是 | 部分完成 |
| `create-profile.tsx` | 创建记忆体页面 | ✅ 核心 | ✅ 是 | 无 |
| `dashboard.tsx` | 仪表盘页面 | ✅ 核心 | ✅ 是 | 无 |
| `index.tsx` | 登录页面 | ✅ 核心 | ✅ 是 | 无 |
| `self-test.tsx` | 综合自测页面 | ⚠️ 重要 | ⚠️ 建议 | 部分完成 |
| `test-chat.tsx` | 测试聊天页面 | ⚠️ 重要 | ⚠️ 建议 | 无 |
| `test-eval.tsx` | 模型评估页面 | ⚠️ 重要 | ⚠️ 建议 | 无 |
| `train-voice.tsx` | 声音训练页面 | ✅ 核心 | ✅ 是 | 部分完成 |

---

## src/pages/api/

| 文件路径 | 文件用途 | 是否核心 | 是否需重点审查 | 已知问题 |
|----------|----------|----------|----------------|----------|
| `assessment.ts` | 项目评估信息 API | ⚠️ 重要 | ⚠️ 建议 | 返回静态数据 |
| `chat.ts` | AI 聊天接口 | ✅ 核心 | ✅ 是 | 无 |
| `health.ts` | 健康检查接口 | ✅ 核心 | ✅ 是 | 无 |
| `profile.ts` | 记忆体 CRUD 接口 | ✅ 核心 | ✅ 是 | 无 |
| `voice-clone.ts` | 声音克隆接口 | ✅ 核心 | ✅ 是 | 无 |
| `voice-synthesize.ts` | 语音合成接口 | ✅ 核心 | ✅ 是 | 无 |
| `voices.ts` | 声音列表接口 | ✅ 核心 | ✅ 是 | 无 |

---

## src/pages/profile/

| 文件路径 | 文件用途 | 是否核心 | 是否需重点审查 | 已知问题 |
|----------|----------|----------|----------------|----------|
| `[id].tsx` | 记忆体详情页面 | ✅ 核心 | ✅ 是 | 无 |
| `[id]/chat.tsx` | 记忆体聊天页面 | ✅ 核心 | ✅ 是 | 部分完成 |
| `[id]/materials.tsx` | 资料管理页面 | ✅ 核心 | ✅ 是 | 未完整实现 |

---

## src/styles/

| 文件路径 | 文件用途 | 是否核心 | 是否需重点审查 | 已知问题 |
|----------|----------|----------|----------------|----------|
| `globals.css` | 全局样式 | ✅ 核心 | ✅ 是 | 无 |

---

## src/types/

| 文件路径 | 文件用途 | 是否核心 | 是否需重点审查 | 已知问题 |
|----------|----------|----------|----------------|----------|
| `index.ts` | TypeScript 类型定义 | ✅ 核心 | ✅ 是 | 无 |

---

## supabase/

| 文件路径 | 文件用途 | 是否核心 | 是否需重点审查 | 已知问题 |
|----------|----------|----------|----------------|----------|
| `schema.sql` | 数据库表结构与 RLS 策略 | ✅ 核心 | ✅ 是 | 无 |

---

## .next/ (构建产物，不应审查)

| 文件路径 | 文件用途 | 是否核心 | 是否需重点审查 | 已知问题 |
|----------|----------|----------|----------------|----------|
| `.next/` | Next.js 构建产物 | ❌ 否 | ❌ 否 | 不应纳入审查范围 |

---

## 重点审查文件汇总

### 必须审查（高优先级）

1. **src/pages/api/chat.ts** - AI 聊天核心逻辑，涉及外部 API 调用
2. **src/pages/api/voice-clone.ts** - 声音克隆核心逻辑
3. **src/pages/api/voice-synthesize.ts** - 语音合成核心逻辑
4. **src/pages/api/profile.ts** - 记忆体 CRUD，涉及用户数据
5. **src/lib/auth-middleware.ts** - 认证中间件，安全性关键
6. **src/lib/server-supabase.ts** - 服务端数据库访问
7. **src/hooks/useAuth.ts** - 认证状态管理
8. **supabase/schema.sql** - 数据库结构和 RLS 策略
9. **.env.example** - 环境变量配置模板
10. **next.config.js** - 应用配置

### 建议审查（中优先级）

1. **src/pages/index.tsx** - 登录页面，用户入口
2. **src/pages/dashboard.tsx** - 仪表盘，数据展示
3. **src/pages/create-profile.tsx** - 创建记忆体表单
4. **src/pages/train-voice.tsx** - 声音训练页面
5. **src/types/index.ts** - 类型定义完整性

### 无需审查（低优先级）

1. **src/pages/_document.tsx** - 文档模板
2. **postcss.config.js** - 样式处理配置
3. **LICENSE** - 许可证文件

---

## 文件状态分类

### ✅ 完整实现

| 文件 | 说明 |
|------|------|
| `src/hooks/useAuth.ts` | 认证状态管理完整 |
| `src/lib/auth-middleware.ts` | 认证中间件完整 |
| `src/lib/server-supabase.ts` | 服务端客户端完整 |
| `src/lib/supabase.ts` | 客户端客户端完整 |
| `src/pages/api/health.ts` | 健康检查完整 |
| `src/pages/api/profile.ts` | 记忆体 CRUD 完整 |
| `src/pages/api/chat.ts` | AI 聊天完整 |
| `src/pages/api/voice-clone.ts` | 声音克隆完整 |
| `src/pages/api/voice-synthesize.ts` | 语音合成完整 |
| `src/pages/api/voices.ts` | 声音列表完整 |
| `src/pages/index.tsx` | 登录页面完整 |
| `src/pages/dashboard.tsx` | 仪表盘完整 |
| `src/pages/create-profile.tsx` | 创建记忆体完整 |
| `src/pages/profile/[id].tsx` | 记忆体详情完整 |
| `supabase/schema.sql` | 数据库结构完整 |

### ⚠️ 部分实现

| 文件 | 说明 |
|------|------|
| `src/pages/chat.tsx` | 聊天页面部分完成 |
| `src/pages/profile/[id]/chat.tsx` | 记忆体聊天部分完成 |
| `src/pages/train-voice.tsx` | 声音训练部分完成 |
| `src/pages/self-test.tsx` | 综合自测部分完成 |

### ❌ 未完整实现

| 文件 | 说明 |
|------|------|
| `src/pages/profile/[id]/materials.tsx` | 资料管理未完整实现 |

### 📋 静态数据

| 文件 | 说明 |
|------|------|
| `src/pages/api/assessment.ts` | 返回静态评估数据 |

---

## 安全审查要点

### API 密钥管理

| 文件 | 风险 | 说明 |
|------|------|------|
| `.env.local` | 🔴 高 | 包含真实 API 密钥，需确保不提交到版本控制 |
| `src/lib/server-supabase.ts` | 🔴 高 | 使用 Service Role Key，需确保安全存储 |
| `src/pages/api/*.ts` | ⚠️ 中 | 直接使用环境变量中的 API 密钥 |

### 输入验证

| 文件 | 风险 | 说明 |
|------|------|------|
| `src/pages/api/chat.ts` | ⚠️ 中 | 需要加强输入内容过滤 |
| `src/pages/api/voice-clone.ts` | ⚠️ 中 | 文件大小限制未处理 |

### 权限控制

| 文件 | 风险 | 说明 |
|------|------|------|
| `src/lib/auth-middleware.ts` | ✅ 低 | 已实现 JWT 验证和 profile 归属检查 |
| `supabase/schema.sql` | ✅ 低 | RLS 策略已配置 |

---

## 性能审查要点

### 数据库查询优化

| 文件 | 状态 | 说明 |
|------|------|------|
| `src/pages/api/profile.ts` | ✅ 已优化 | 使用索引查询 |
| `src/pages/api/chat.ts` | ✅ 已优化 | 限制资料查询数量 |

### API 响应时间

| API | 预期响应时间 | 优化空间 |
|-----|-------------|----------|
| `/api/profile` | < 200ms | 良好 |
| `/api/chat` | 2-5s | 受 OpenAI 限制 |
| `/api/voice-clone` | 10-30s | 受 ElevenLabs 限制 |
| `/api/voice-synthesize` | 1-5s | 受 ElevenLabs 限制 |

---

## 代码质量审查要点

### 类型安全

| 文件 | 状态 | 说明 |
|------|------|------|
| `src/types/index.ts` | ✅ 完整 | 定义了所有核心类型 |
| `src/pages/api/*.ts` | ✅ 良好 | 使用了 TypeScript 类型 |

### 错误处理

| 文件 | 状态 | 说明 |
|------|------|------|
| `src/pages/api/*.ts` | ✅ 良好 | 包含 try-catch 和错误返回 |
| `src/hooks/useAuth.ts` | ✅ 良好 | 包含错误处理 |

### 代码结构

| 文件 | 状态 | 说明 |
|------|------|------|
| 整体结构 | ✅ 良好 | 遵循 Next.js 最佳实践 |
| 模块化 | ✅ 良好 | 核心逻辑独立为库文件 |
