import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export type MigrationChecksum = {
  filename: string;
  checksum: string;
};

export type BackupReadinessResult = {
  ready: boolean;
  migrationCount: number;
  errors: string[];
};

const manifestLinePattern = /^([a-f0-9]{64}) {2}([0-9]{12}_[a-z0-9_]+\.sql)$/;

export function parseMigrationManifest(content: string): MigrationChecksum[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = manifestLinePattern.exec(line);
      if (!match) {
        throw new Error('迁移校验清单格式无效');
      }

      return {
        checksum: match[1],
        filename: match[2],
      };
    });
}

export function inspectMigrationIntegrity(
  migrationsDirectory: string
): BackupReadinessResult {
  const errors: string[] = [];
  const manifestPath = path.join(migrationsDirectory, 'MANIFEST.sha256');
  let manifest: MigrationChecksum[] = [];

  try {
    manifest = parseMigrationManifest(readFileSync(manifestPath, 'utf8'));
  } catch {
    return {
      ready: false,
      migrationCount: 0,
      errors: ['无法读取或解析迁移校验清单'],
    };
  }

  const sqlFiles = readdirSync(migrationsDirectory)
    .filter((filename) => filename.endsWith('.sql'))
    .sort();
  const manifestFiles = manifest.map(({ filename }) => filename);

  if (new Set(manifestFiles).size !== manifestFiles.length) {
    errors.push('迁移校验清单包含重复文件');
  }

  if (sqlFiles.join('\n') !== [...manifestFiles].sort().join('\n')) {
    errors.push('迁移文件与校验清单不一致');
  }

  if (manifestFiles.join('\n') !== [...manifestFiles].sort().join('\n')) {
    errors.push('迁移校验清单未按执行顺序排列');
  }

  for (const entry of manifest) {
    try {
      const actualChecksum = createHash('sha256')
        .update(readFileSync(path.join(migrationsDirectory, entry.filename)))
        .digest('hex');

      if (actualChecksum !== entry.checksum) {
        errors.push(`迁移文件校验失败：${entry.filename}`);
      }
    } catch {
      errors.push(`无法读取迁移文件：${entry.filename}`);
    }
  }

  return {
    ready: errors.length === 0,
    migrationCount: manifest.length,
    errors,
  };
}
