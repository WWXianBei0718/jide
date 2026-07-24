import assert from 'node:assert/strict';
import test from 'node:test';
import {
  securityAuditCutoff,
  SECURITY_AUDIT_DELETE_BATCH_SIZE,
  SECURITY_AUDIT_MAX_DELETE_PER_RUN,
  SECURITY_AUDIT_RETENTION_DAYS,
} from '../src/lib/security-audit-retention';

test('security audit retention defaults to a bounded 90-day window', () => {
  assert.equal(SECURITY_AUDIT_RETENTION_DAYS, 90);
  assert.equal(
    securityAuditCutoff(new Date('2026-07-24T00:00:00.000Z')),
    '2026-04-25T00:00:00.000Z'
  );
});

test('security audit retention rejects unsafe windows and bounds each cleanup run', () => {
  assert.throws(() => securityAuditCutoff(new Date(), 29));
  assert.throws(() => securityAuditCutoff(new Date(), 366));
  assert.throws(() => securityAuditCutoff(new Date(), 90.5));
  assert.ok(SECURITY_AUDIT_DELETE_BATCH_SIZE <= 500);
  assert.ok(SECURITY_AUDIT_MAX_DELETE_PER_RUN <= 10_000);
});
