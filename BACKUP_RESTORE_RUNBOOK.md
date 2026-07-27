# 「记得」备份与恢复运行手册

> 最后更新：2026-07-23
>
> 适用阶段：工程型 Alpha / Supabase 开发项目
>
> 当前状态：本地恢复就绪检查已建立；真实数据导出与隔离恢复演练尚未执行

## 1. 为什么必须分别备份

“记得”的数据至少分为两部分：

1. PostgreSQL：账号、人物、关系、文字资料、对话、同意记录、文件元数据和向量索引。
2. Supabase Storage：录音、照片、视频、文档及其他真实文件。

Supabase 的数据库备份只包含 Storage 元数据，不包含 Storage 中的文件本体。因此，仅有数据库备份不能恢复完整产品。

当前项目若处于 Supabase Free Plan，不能依赖 Pro/Team/Enterprise 的每日可恢复备份。Supabase 官方建议免费项目定期使用 CLI 导出数据库，并保存站外副本。

官方依据：

- 数据库备份与套餐说明：https://supabase.com/docs/guides/platform/backups
- CLI 备份与恢复：https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- Storage 文件下载：https://supabase.com/docs/guides/storage/management/download-objects

## 2. 当前已经完成的保护

- 所有数据库结构变更都保存在 `supabase/migrations/`。
- `MANIFEST.sha256` 固定记录每份迁移的顺序和内容校验值（当前 15 份）。
- `npm run backup:verify` 会在本地验证迁移是否缺失、被改写或顺序异常。
- `backups/`、`*.backup`、`*.dump`、`*.sql.gz` 已加入 `.gitignore`，避免把私人备份提交进 Git。
- 上述检查不联网、不读取 Supabase 业务数据、不调用 OpenAI 或 ElevenLabs，也不产生云端费用。

新增迁移时，必须同时更新 `MANIFEST.sha256`。已部署迁移不得原地修改，应新增迁移文件。

## 3. 真实备份的最低组成

每次真实备份必须形成同一时间批次，并包含：

- 数据库角色导出；
- 数据库结构导出；
- 数据库数据导出；
- 两个私有 Bucket（`memory-quarantine`、`memory-assets`）的文件本体；
- Storage 文件清单：Bucket、对象路径、大小、SHA-256；
- 本次应用 Git 提交号和迁移清单；
- 备份时间、源项目、执行人和验证结果。

不在备份中保存 OpenAI、ElevenLabs、Supabase Service Role 或数据库连接密码。

## 4. 安全要求

- 备份目录不得位于 Git 仓库追踪范围内。
- 备份必须加密，解密密钥与备份文件分开保存。
- 不通过聊天、邮件或公开网盘传递数据库密码和备份。
- 恢复演练只能使用独立的临时 Supabase 项目，不能覆盖当前开发项目。
- 恢复完成后先关闭外部调用开关，避免恢复出的任务或配置意外调用第三方服务。
- 临时项目验收完成后，必须确认导出验证记录，再删除临时项目和本地明文文件。

## 5. 第一次真实演练步骤

以下操作需要项目 Owner 明确授权后执行：

1. 确认 Supabase 套餐、可接受费用和恢复目标。
2. 创建独立临时项目，不复用生产或开发项目。
3. 获取短期数据库连接方式；密码只由 Owner 在本机填写，不进入 Git 和聊天。
4. 按 Supabase 官方 CLI 流程导出角色、结构和数据。
5. 分别导出两个私有 Storage Bucket 的文件及校验清单。
6. 将数据库恢复到临时项目，再恢复 Storage 文件。
7. 使用虚构测试账号验证：登录、人物、材料、对话、RLS、文件签名下载和删除。
8. 比对表记录数、Storage 对象数与 SHA-256；记录恢复耗时和失败项。
9. 清理临时项目和所有未加密明文备份。

## 6. 发布闸门

公开上线前必须满足：

- 最近一次完整备份成功；
- 最近一次隔离恢复演练成功；
- 数据库和 Storage 均有异地加密副本；
- 恢复流程有明确负责人；
- 已记录可接受数据丢失窗口（RPO）和恢复时长（RTO）；
- 每次重大数据库变更后重新演练；
- 任何恢复失败都视为发布阻断，不以“已有备份文件”代替可恢复性证明。
