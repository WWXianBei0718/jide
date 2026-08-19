import type { EmailOtpType } from '@supabase/supabase-js';

const EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  'email',
  'email_change',
  'invite',
  'magiclink',
  'recovery',
  'signup',
]);

export interface AuthConfirmationParams {
  code: string | null;
  tokenHash: string | null;
  type: EmailOtpType | null;
}

export function parseAuthConfirmationParams(search: string): AuthConfirmationParams {
  const params = new URLSearchParams(search);
  const rawType = params.get('type');

  return {
    code: params.get('code'),
    tokenHash: params.get('token_hash'),
    type:
      rawType && EMAIL_OTP_TYPES.has(rawType as EmailOtpType)
        ? (rawType as EmailOtpType)
        : null,
  };
}
