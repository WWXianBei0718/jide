# Supabase 部署顺序

数据库变更统一放在 `migrations/`，并按文件名顺序执行：

1. `202607150000_initial_schema.sql` 创建基础业务表、索引和 RLS。
2. `202607150001_secure_multimedia_uploads.sql` 增加安全多媒体上传能力。
3. `202607150002_harden_relationship_rls.sql` 收紧关系数据隔离。
4. `202607220000_add_chat_rate_limits.sql` 增加聊天持久限流。
5. `202607220001_secure_memory_chunks.sql` 增加安全向量记忆。
6. `202607230000_add_external_api_quotas.sql` 限制语音供应商调用。
7. `202607230001_add_upload_quotas.sql` 限制上传次数和容量。

新项目必须从第一条迁移开始执行。已有项目只执行尚未应用的迁移，不能重复手工拼接 SQL。每次执行后应记录迁移文件名和执行时间。

`202607150001_secure_multimedia_uploads.sql` 会创建私有 `memory-quarantine`、`memory-assets` Bucket，扩展上传状态、同意证明字段和材料文件关联。未应用该迁移时，多媒体上传 API 不会工作。

生产环境默认关闭文件上传。只有在以下条件满足后才设置：

```text
ENABLE_FILE_UPLOADS=true
```

`ENABLE_UNSCANNED_UPLOADS` 在生产环境必须保持 `false`。当前代码完成扩展名、MIME、大小和文件签名校验，但恶意文件扫描 Worker 尚未接入；只有内部开发环境允许基础校验后直接发布。

声音克隆还有独立的 `ENABLE_VOICE_CLONING` 发布开关。只有在声纹同意告知、第三方处理协议、删除流程和生产审核均完成后才能开启。

不要把 Service Role、数据库密码或供应商密钥写入 SQL、Git 或前端环境变量。

`MANIFEST.sha256` 记录全部迁移的执行顺序和内容校验值。已部署迁移不得原地修改；
新增迁移后必须更新清单，并运行 `npm run backup:verify`。
