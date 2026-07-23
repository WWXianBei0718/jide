import type { NextApiRequest, NextApiResponse } from 'next';
import { beginApiRequest, logApiError } from '@/lib/api-observability';
import { authenticate } from '@/lib/auth-middleware';
import { accountExportFileName } from '@/lib/account-export';
import { collectAccountExport } from '@/lib/account-export-data';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const requestContext = beginApiRequest(req, res, 'api.account_export');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await authenticate(req, res);
  if (!user) return;

  try {
    const { archive } = await collectAccountExport(user.id, user.email);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${accountExportFileName()}"`
    );
    return res.status(200).send(JSON.stringify(archive, null, 2));
  } catch (error) {
    logApiError(requestContext, 'account_export.request_failed', {
      errorName: error instanceof Error ? error.name : 'unknown',
    });
    return res.status(500).json({ error: '无法完整导出数据，请稍后重试' });
  }
}
