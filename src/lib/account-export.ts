export const ACCOUNT_EXPORT_VERSION = 'remember-account-export-v2';

export interface AccountExportInput {
  user: {
    id: string;
    email: string | null;
  };
  profiles: unknown[];
  materials: unknown[];
  memoryChunks: unknown[];
  conversations: unknown[];
  messages: unknown[];
  uploadedFiles: unknown[];
  consents: unknown[];
  voiceCloningJobs: unknown[];
  chatUsageEvents: unknown[];
  externalApiUsageEvents: unknown[];
}

export interface AccountExportArchive extends AccountExportInput {
  exportVersion: string;
  exportedAt: string;
  notice: {
    simulatedPersonDisclosure: string;
    fileContent: string;
    derivedVectors: string;
  };
}

export function buildAccountExportArchive(
  input: AccountExportInput,
  exportedAt = new Date().toISOString()
): AccountExportArchive {
  return {
    exportVersion: ACCOUNT_EXPORT_VERSION,
    exportedAt,
    notice: {
      simulatedPersonDisclosure: '“记得”中的数字人物和回复是 AI 模拟，不是真实人物本人。',
      fileContent: '本文件包含私有文件清单，不包含图片、音频、视频或 PDF 的二进制正文。',
      derivedVectors: '为减少体积和避免暴露不可读的派生数据，本导出不包含 Embedding 向量数字。',
    },
    ...input,
  };
}

export function accountExportFileName(date = new Date()): string {
  return `remember-account-export-${date.toISOString().slice(0, 10)}.json`;
}
