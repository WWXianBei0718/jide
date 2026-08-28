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

`eval:persona` 默认运行完整 40 题；`eval:persona:smoke` 是开发中的可选 12 题快速检查，不能替代正式验证。评测会先按当前向量与混合检索配置选择 3 个片段，再使用与生产聊天相同的高风险依据审校和单源收敛规则。报告写入 `evals/results/latest.md`；更换规则时，旧报告会按数据集、提示词、依据审校、评测模式和供应商版本自动归档。真实运行前必须确认当前 AI 供应商预算；不要把真实人物资料加入公共或未授权评测集。

本地 PDF Worker 默认只输出配置，不读取文件或写数据库：

```bash
npm run materials:process:pdf:dry
```

`npm run materials:process:pdf` 会领取最多 3 个 PDF 任务、从私有 Storage 下载文件并把本地提取文字写回材料。只有在第 15 份迁移已部署、运行环境受控且明确获准处理开发库文件时才能执行；它不调用 OpenAI、ElevenLabs 或外部 OCR 服务。

本地图片 OCR Worker 同样默认只输出配置：

```bash
npm run materials:process:ocr:dry
```

`npm run materials:process:ocr` 只领取 `image_ocr` 任务，校验私有 Storage 中的 JPEG、PNG 和 WebP 字节后，把原始图片发送给仅允许内网地址的 OCR 适配器。适配器必须接受原始图片字节并返回 `{"text":"..."}`；回写前会限制输入、响应和文字长度，并保存处理器版本与内容哈希。当前只完成安全调用边界，尚未部署 PaddleOCR 服务或处理真实文件。

本地音视频转写 Worker 默认同样不读取数据库、Storage 或转写服务：

```bash
npm run materials:process:transcription:dry
```

`npm run materials:process:transcription` 只领取 `audio_transcription` 和 `video_transcription` 任务，并要求任务类型与真实 MIME 类型一致。它会校验私有 Storage 文件的大小和二进制签名，再把不超过 25MB 的受支持音视频发送到仅允许内网地址的转写适配器；适配器接受原始媒体字节并返回 `{"text":"..."}`。请求最长 15 分钟，响应和文字长度均有硬上限，数据库只保存规范化文字、处理器版本和内容哈希。当前未部署本地 Whisper 服务，也未处理真实文件。

恶意文件扫描 Worker 同样默认只输出配置，不访问数据库、Storage 或扫描服务：

```bash
npm run uploads:scan:dry
```

`npm run uploads:scan` 需要私有 ClamAV 服务和第 16 份迁移。它只领取仍在有效期内且明确等待扫描的隔离区文件；扫描通过后才发布到私有素材区，发现恶意文件时拒绝并清理隔离对象。第 16 份迁移已部署并回读，但尚未部署 ClamAV 或处理真实文件，因此不能宣称已经具备生产恶意文件扫描能力。

## 环境变量

复制 `.env.example` 为 `.env.local`，仅在本地填写以下变量：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `AI_PROVIDER`
- `AI_EMBEDDING_PROVIDER`
- `DASHSCOPE_API_KEY`
- `DASHSCOPE_BASE_URL`
- `QWEN_CHAT_MODEL`
- `QWEN_EMBEDDING_MODEL`
- `ELEVENLABS_API_KEY`

不得提交 `.env.local`，不得在前端或日志中输出服务端密钥。macOS/Linux 创建文件后应执行
`chmod 600 .env.local`，确保只有当前系统用户可以读取和修改真实密钥；本地测试会自动检查这一权限。
