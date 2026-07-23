import path from 'node:path';
import { inspectMigrationIntegrity } from '../src/lib/backup-readiness';

const migrationsDirectory = path.resolve(process.cwd(), 'supabase', 'migrations');
const result = inspectMigrationIntegrity(migrationsDirectory);

if (!result.ready) {
  process.stderr.write([
    '备份恢复基线检查失败：',
    ...result.errors.map((error) => `- ${error}`),
    '',
  ].join('\n'));
  process.exitCode = 1;
} else {
  process.stdout.write([
    '备份恢复基线检查通过。',
    `- 已验证 ${result.migrationCount} 份数据库迁移的文件名、顺序和 SHA-256 完整性`,
    '- 未连接 Supabase、未读取业务数据、未创建任何备份文件',
    '- 真实数据库与 Storage 恢复演练仍需在隔离项目中单独授权执行',
    '',
  ].join('\n'));
}
