import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  enforceSecurityAuditRetention,
  SECURITY_AUDIT_RETENTION_DAYS,
} from '../src/lib/security-audit-retention';

function loadLocalEnv(): void {
  const envPath = resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main(): Promise<void> {
  loadLocalEnv();
  const execute = process.argv.includes('--execute');
  const result = await enforceSecurityAuditRetention({ execute });

  process.stdout.write([
    `Mode: ${execute ? 'EXECUTE' : 'DRY RUN (no deletes)'}`,
    `Retention: ${SECURITY_AUDIT_RETENTION_DAYS} days`,
    `Cutoff: ${result.cutoff}`,
    `Eligible: ${result.eligible}`,
    `Deleted: ${result.deleted}`,
    `Deferred: ${result.deferred}`,
    '',
  ].join('\n'));
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Security audit retention failed'}\n`
  );
  process.exitCode = 1;
});
