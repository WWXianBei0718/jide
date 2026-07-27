# 记得

“记得”是一个 AI 数字记忆与情感陪伴产品。产品最高原则是：**真实性大于智能性**。

当前阶段为工程型 Alpha，具备封闭测试基础，但尚未达到文字对话 Beta，也不适合公开上线。

## 新会话从这里开始

项目文档按以下优先级理解；发生冲突时，以上方文件为准：

1. [`CURRENT_STATE.md`](./CURRENT_STATE.md)：当前已实现、已验证和未完成事项。
2. [`PRODUCT_PRINCIPLES.md`](./PRODUCT_PRINCIPLES.md)：产品原则和 Beta 发布闸门。
3. [`PRIVACY_DATA_LIFECYCLE.md`](./PRIVACY_DATA_LIFECYCLE.md)：账号数据导出、文件与供应商资源删除边界。
4. [`SECURITY_ARCHITECTURE.md`](./SECURITY_ARCHITECTURE.md)：安全目标架构；不代表所有内容均已实现。
5. `CODE_REVIEW_REPORT.md`、`PROJECT_ASSESSMENT.md`、`PROJECT_REVIEW_PACKAGE.md`、`PROJECT_FILE_INDEX.md`、`EVALUATION_GUIDE.md`：历史审查快照，仅用于追溯。

仓库外的最新完整接管报告位于 [`../CODEX_PROJECT_AUDIT.md`](../CODEX_PROJECT_AUDIT.md)。

## 本地验证

```bash
npm run check
```

该命令依次运行 Lint、TypeScript、单元测试和 Next.js 生产构建。

安全审计保留工具默认只做预览：

```bash
npm run audit:retention:dry
```

只有 `npm run audit:retention` 会分批删除超过 90 天的安全审计事件；该命令不读取人物资料、聊天内容或文件。

人格评测使用完全虚构资料，默认有 1 美元硬上限：

```bash
npm run eval:persona:dry
npm run eval:persona
npm run eval:persona:smoke
npm run eval:persona:resume
```

`eval:persona` 默认运行完整 40 题；`eval:persona:smoke` 是开发中的可选 12 题快速检查，不能替代正式验证。报告写入 `evals/results/latest.md`；更换人格规则版本时，旧报告会按数据集、提示词版本和评测模式自动归档。真实运行前必须确认 OpenAI 预算；不要把真实人物资料加入公共或未授权评测集。

本地 PDF Worker 默认只输出配置，不读取文件或写数据库：

```bash
npm run materials:process:pdf:dry
```

`npm run materials:process:pdf` 会领取最多 3 个 PDF 任务、从私有 Storage 下载文件并把本地提取文字写回材料。只有在第 15 份迁移已部署、运行环境受控且明确获准处理开发库文件时才能执行；它不调用 OpenAI、ElevenLabs 或外部 OCR 服务。图片 OCR 和音视频转写尚未接入。

## 环境变量

复制 `.env.example` 为 `.env.local`，仅在本地填写以下变量：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `ELEVENLABS_API_KEY`

不得提交 `.env.local`，不得在前端或日志中输出服务端密钥。macOS/Linux 创建文件后应执行
`chmod 600 .env.local`，确保只有当前系统用户可以读取和修改真实密钥；本地测试会自动检查这一权限。
