# 记得

“记得”是一个 AI 数字记忆与情感陪伴产品。产品最高原则是：**真实性大于智能性**。

当前阶段为工程型 Alpha，具备封闭测试基础，但尚未达到文字对话 Beta，也不适合公开上线。

## 新会话从这里开始

项目文档按以下优先级理解；发生冲突时，以上方文件为准：

1. [`CURRENT_STATE.md`](./CURRENT_STATE.md)：当前已实现、已验证和未完成事项。
2. [`PRODUCT_PRINCIPLES.md`](./PRODUCT_PRINCIPLES.md)：产品原则和 Beta 发布闸门。
3. [`SECURITY_ARCHITECTURE.md`](./SECURITY_ARCHITECTURE.md)：安全目标架构；不代表所有内容均已实现。
4. `CODE_REVIEW_REPORT.md`、`PROJECT_ASSESSMENT.md`、`PROJECT_REVIEW_PACKAGE.md`、`PROJECT_FILE_INDEX.md`、`EVALUATION_GUIDE.md`：历史审查快照，仅用于追溯。

仓库外的最新完整接管报告位于 [`../CODEX_PROJECT_AUDIT.md`](../CODEX_PROJECT_AUDIT.md)。

## 本地验证

```bash
npm run check
```

该命令依次运行 Lint、TypeScript、单元测试和 Next.js 生产构建。

人格评测使用完全虚构资料，默认有 1 美元硬上限：

```bash
npm run eval:persona:dry
npm run eval:persona
npm run eval:persona:resume
```

报告写入 `evals/results/latest.md`。真实运行前必须确认 OpenAI 预算；不要把真实人物资料加入公共或未授权评测集。

## 环境变量

复制 `.env.example` 为 `.env.local`，仅在本地填写以下变量：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `ELEVENLABS_API_KEY`

不得提交 `.env.local`，不得在前端或日志中输出服务端密钥。
