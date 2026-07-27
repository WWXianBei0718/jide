# Supabase 部署顺序

数据库变更统一放在 `migrations/`，并按文件名顺序执行：

1. `202607150000_initial_schema.sql` 创建基础业务表、索引和 RLS。
2. `202607150001_secure_multimedia_uploads.sql` 增加安全多媒体上传能力。
3. `202607150002_harden_relationship_rls.sql` 收紧关系数据隔离。
4. `202607220000_add_chat_rate_limits.sql` 增加聊天持久限流。
5. `202607220001_secure_memory_chunks.sql` 增加安全向量记忆。
6. `202607230000_add_external_api_quotas.sql` 限制语音供应商调用。
7. `202607230001_add_upload_quotas.sql` 限制上传次数和容量。
8. `202607230002_restrict_message_roles.sql` 禁止客户端伪造 AI/System 消息。
9. `202607230003_add_embedding_quotas.sql` 限制文字资料语义索引的请求次数和字符量。
10. `202607240000_atomic_account_deletion.sql` 将账号业务数据清理合并为仅服务端可调用的数据库事务。
11. `202607240001_add_security_audit_events.sql` 仅保存无正文、无用户标识的安全运行元数据。
12. `202607240002_add_material_processing_jobs.sql` 将文件安全状态与 OCR、转写和文档解析状态分离，并为已安全发布的非文字资料建立待处理任务。
13. `202607240003_harden_versioned_consents.sql` 将同意记录收紧为登录用户只读、仅可信服务端可写的版本化账本，并增加按人物和用途读取最新状态的索引。
14. `202607270000_add_material_processing_leases.sql` 为多模态处理任务增加并发安全领取、短期租约、超时恢复、受控重试和带来源版本的提取结果落库边界。
15. `202607270001_scope_material_job_claims.sql` 要求每个 Worker 只领取自己明确支持的任务类型，避免 PDF 处理器误占图片、音频或视频任务。
16. `202607270002_add_upload_scan_leases.sql` 为隔离区文件增加并发安全的恶意文件扫描领取、租约、受控重试和仅在扫描通过后发布的服务端边界。

新项目必须从第一条迁移开始执行。已有项目只执行尚未应用的迁移，不能重复手工拼接 SQL。每次执行后应记录迁移文件名和执行时间。

`202607150001_secure_multimedia_uploads.sql` 会创建私有 `memory-quarantine`、`memory-assets` Bucket，扩展上传状态、同意证明字段和材料文件关联。未应用该迁移时，多媒体上传 API 不会工作。

`202607240002_add_material_processing_jobs.sql` 只建立处理任务和状态边界，不执行 OCR、转写、文档解析、Embedding 或任何付费外部 API 调用。只有 `extracted` 状态才表示已经取得可索引文字；上传文件的 `ready` 仅表示文件通过当前安全发布条件。

`202607240003_harden_versioned_consents.sql` 不代表已经完成法律合规评估。它只保证应用在技术上能够按人物、用途、告知版本和撤回状态阻止新的第三方调用；正式告知文本、跨境路径和供应商协议仍须在公开上线前由合格专业人员复核。

`202607270000_add_material_processing_leases.sql` 不调用 OCR、转写、Embedding 或其他供应商。提取成功只会保存经过长度限制和哈希记录的文字，并把语义索引状态设为 `blocked`；只有用户通过当前 AI 数据处理告知后，后续独立流程才能建立向量记忆。

生产环境默认关闭文件上传。只有在以下条件满足后才设置：

```text
ENABLE_FILE_UPLOADS=true
```

`ENABLE_UNSCANNED_UPLOADS` 在生产环境必须保持 `false`。当前代码完成扩展名、MIME、大小和文件签名校验，但恶意文件扫描 Worker 尚未接入；只有内部开发环境允许基础校验后直接发布。

声音克隆还有独立的 `ENABLE_VOICE_CLONING` 发布开关。只有在声纹同意告知、第三方处理协议、删除流程和生产审核均完成后才能开启。

不要把 Service Role、数据库密码或供应商密钥写入 SQL、Git 或前端环境变量。

`MANIFEST.sha256` 记录全部迁移的执行顺序和内容校验值。已部署迁移不得原地修改；
新增迁移后必须更新清单，并运行 `npm run backup:verify`。
