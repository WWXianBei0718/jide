import { ZipArchive } from 'archiver';
import { createHash } from 'node:crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { beginApiRequest, logApiError } from '@/lib/api-observability';
import { authenticate } from '@/lib/auth-middleware';
import { adminSupabase } from '@/lib/admin-supabase';
import { accountExportFileName } from '@/lib/account-export';
import { collectAccountExport } from '@/lib/account-export-data';
import {
  buildPrivateFileManifest,
  privateFileArchivePath,
  validatePrivateExportSize,
} from '@/lib/account-export-archive';

export const config = {
  api: {
    responseLimit: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const requestContext = beginApiRequest(req, res, 'api.account_export_archive');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await authenticate(req, res);
  if (!user) return;

  try {
    const { archive: accountData, privateFiles } = await collectAccountExport(user.id, user.email);
    validatePrivateExportSize(privateFiles);

    const fileBuffers = [];
    for (const file of privateFiles) {
      const { data, error } = await adminSupabase.storage
        .from(file.storageBucket)
        .download(file.storagePath);
      if (error || !data) throw new Error('private_file_download_failed');
      const buffer = Buffer.from(await data.arrayBuffer());
      if (buffer.length !== file.fileSize) throw new Error('private_file_size_mismatch');
      if (
        file.sha256 &&
        createHash('sha256').update(buffer).digest('hex') !== file.sha256
      ) {
        throw new Error('private_file_hash_mismatch');
      }
      fileBuffers.push({ file, buffer });
    }

    const zipFileName = accountExportFileName().replace(/\.json$/, '.zip');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);

    const zip = new ZipArchive({ zlib: { level: 6 } });
    zip.on('warning', async (warning) => {
      await logApiError(requestContext, 'account_export.archive_warning', {
        errorName: warning.name,
      });
    });
    zip.on('error', async (error) => {
      await logApiError(requestContext, 'account_export.archive_failed', {
        errorName: error.name,
      });
      res.destroy();
    });
    zip.pipe(res);
    zip.append(JSON.stringify(accountData, null, 2), { name: 'account-data.json' });
    zip.append(JSON.stringify(buildPrivateFileManifest(privateFiles), null, 2), {
      name: 'file-manifest.json',
    });
    for (const { file, buffer } of fileBuffers) {
      zip.append(buffer, { name: privateFileArchivePath(file) });
    }
    await zip.finalize();
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown';
    if (res.headersSent) {
      res.destroy();
      return;
    }
    if (reason === 'private_export_too_large') {
      return res.status(413).json({
        error: '私有文件超过当前单次导出的 100 个文件或 100MB 限制，请等待大容量异步导出功能',
      });
    }
    await logApiError(requestContext, 'account_export_archive.request_failed', {
      errorName: error instanceof Error ? error.name : 'unknown',
      outcome: reason === 'private_file_download_failed'
        || reason === 'private_file_size_mismatch'
        || reason === 'private_file_hash_mismatch'
        ? reason
        : 'unexpected',
    });
    return res.status(500).json({ error: '无法完整打包私有文件，请稍后重试' });
  }
}
