import { adminSupabase } from './admin-supabase';

export const SECURITY_AUDIT_RETENTION_DAYS = 90;
export const SECURITY_AUDIT_DELETE_BATCH_SIZE = 500;
export const SECURITY_AUDIT_MAX_DELETE_PER_RUN = 10_000;

export interface SecurityAuditRetentionResult {
  mode: 'dry-run' | 'execute';
  cutoff: string;
  eligible: number;
  deleted: number;
  deferred: number;
}

export function securityAuditCutoff(
  now = new Date(),
  retentionDays = SECURITY_AUDIT_RETENTION_DAYS
): string {
  if (
    !Number.isInteger(retentionDays)
    || retentionDays < 30
    || retentionDays > 365
  ) {
    throw new Error('Audit retention must be an integer between 30 and 365 days');
  }

  return new Date(
    now.getTime() - retentionDays * 24 * 60 * 60 * 1000
  ).toISOString();
}

export async function enforceSecurityAuditRetention(options: {
  execute: boolean;
  now?: Date;
  retentionDays?: number;
}): Promise<SecurityAuditRetentionResult> {
  const cutoff = securityAuditCutoff(options.now, options.retentionDays);
  const { count, error: countError } = await adminSupabase
    .from('security_audit_events')
    .select('id', { count: 'exact', head: true })
    .lt('created_at', cutoff);

  if (countError) {
    throw new Error('Unable to inspect security audit retention');
  }

  const eligible = count || 0;
  if (!options.execute || eligible === 0) {
    return {
      mode: options.execute ? 'execute' : 'dry-run',
      cutoff,
      eligible,
      deleted: 0,
      deferred: eligible,
    };
  }

  let deleted = 0;
  while (deleted < SECURITY_AUDIT_MAX_DELETE_PER_RUN) {
    const remainingCapacity = SECURITY_AUDIT_MAX_DELETE_PER_RUN - deleted;
    const batchSize = Math.min(SECURITY_AUDIT_DELETE_BATCH_SIZE, remainingCapacity);
    const { data: candidates, error: candidatesError } = await adminSupabase
      .from('security_audit_events')
      .select('id')
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (candidatesError) {
      throw new Error('Unable to read expired security audit events');
    }

    const ids = (candidates || []).map((event: { id: string }) => event.id);
    if (ids.length === 0) break;

    const { data: removed, error: deleteError } = await adminSupabase
      .from('security_audit_events')
      .delete()
      .in('id', ids)
      .lt('created_at', cutoff)
      .select('id');

    if (deleteError || !removed || removed.length !== ids.length) {
      throw new Error('Security audit retention stopped after a partial batch');
    }

    deleted += removed.length;
    if (ids.length < batchSize) break;
  }

  return {
    mode: 'execute',
    cutoff,
    eligible,
    deleted,
    deferred: Math.max(0, eligible - deleted),
  };
}
