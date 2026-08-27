import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { adminSupabase } from '../src/lib/admin-supabase';
import { createMemoryBackfillPlan, type BackfillMaterial } from '../src/lib/memory-backfill';
import { indexMemoryMaterial } from '../src/lib/memory-indexing';
import { hasActiveAiDataProcessingConsent } from '../src/lib/ai-processing-consent';
import { getEmbeddingProvider } from '../src/lib/ai-provider';

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function argumentValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

async function main(): Promise<void> {
  loadLocalEnv();
  const execute = process.argv.includes('--execute');
  const rawLimit = Number(argumentValue('limit') || 25);
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 100) {
    throw new Error('--limit must be an integer between 1 and 100');
  }

  let query = adminSupabase
    .from('memory_materials')
    .select('id, memory_profile_id, type, content, metadata, created_at')
    .order('created_at', { ascending: true })
    .limit(1000);
  const profileId = argumentValue('profile');
  if (profileId) query = query.eq('memory_profile_id', profileId);

  const { data, error } = await query;
  if (error) throw new Error('Unable to read memory material backfill candidates');
  const plan = createMemoryBackfillPlan((data || []) as BackfillMaterial[], rawLimit);

  process.stdout.write([
    `Mode: ${execute ? 'EXECUTE' : 'DRY RUN (no external AI calls, no writes)'}`,
    `Scanned: ${(data || []).length}`,
    `Eligible: ${plan.eligibleCount}`,
    `Selected this run: ${plan.candidates.length}`,
    `Deferred by limit: ${plan.deferredCount}`,
    `Already current: ${plan.skipped.ready}`,
    `No text: ${plan.skipped.noText}`,
    `Unsupported type: ${plan.skipped.unsupported}`,
  ].join('\n') + '\n');

  if (!execute) return;
  const embeddingProvider = getEmbeddingProvider();
  if (!embeddingProvider.apiKey) {
    throw new Error(`${embeddingProvider.label} API key is required for --execute`);
  }

  let completed = 0;
  for (const material of plan.candidates) {
    if (!await hasActiveAiDataProcessingConsent(adminSupabase, material.memory_profile_id)) {
      process.stdout.write('Stopped safely: the next profile has no active AI data processing consent.\n');
      process.exitCode = 1;
      return;
    }
    const result = await indexMemoryMaterial({
      materialId: material.id,
      profileId: material.memory_profile_id,
      sourceType: 'text',
      content: material.content,
      metadata: material.metadata,
    });
    if (result.status !== 'ready') {
      process.stdout.write(`Stopped safely after ${completed} successful item(s); the next item failed.\n`);
      process.exitCode = 1;
      return;
    }
    completed += 1;
    process.stdout.write(`Indexed ${completed}/${plan.candidates.length}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Memory backfill failed'}\n`);
  process.exitCode = 1;
});
