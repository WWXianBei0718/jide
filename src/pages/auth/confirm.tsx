import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '@/lib/supabase';
import { parseAuthConfirmationParams } from '@/lib/auth-confirmation';

type ConfirmationStatus = 'verifying' | 'success' | 'error';

const STATUS_COPY: Record<ConfirmationStatus, { title: string; detail: string }> = {
  verifying: {
    title: '正在验证邮箱',
    detail: '请稍候，不要关闭这个页面。',
  },
  success: {
    title: '邮箱验证成功',
    detail: '账号已准备好，正在进入记得。',
  },
  error: {
    title: '验证链接无效或已过期',
    detail: '请返回登录页面重新登录，或重新获取验证邮件。',
  },
};

export default function ConfirmEmailPage() {
  const router = useRouter();
  const [status, setStatus] = useState<ConfirmationStatus>('verifying');

  useEffect(() => {
    let active = true;
    let redirectTimer: ReturnType<typeof setTimeout> | undefined;

    const confirmEmail = async () => {
      try {
        const { code, tokenHash, type } = parseAuthConfirmationParams(
          window.location.search
        );

        let confirmedUser = null;

        if (tokenHash) {
          if (!type) throw new Error('Invalid confirmation type');

          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type,
          });
          if (error) throw error;
          confirmedUser = data.user ?? data.session?.user ?? null;
        } else {
          const { data, error } = await supabase.auth.getSession();
          if (error) throw error;
          confirmedUser = data.session?.user ?? null;

          if (!confirmedUser && code) {
            const { data: codeData, error: codeError } =
              await supabase.auth.exchangeCodeForSession(code);
            if (codeError) throw codeError;
            confirmedUser = codeData.user ?? codeData.session?.user ?? null;
          }
        }

        if (!confirmedUser) throw new Error('No confirmed user session');
        if (!active) return;

        window.history.replaceState({}, document.title, '/auth/confirm');
        setStatus('success');
        redirectTimer = setTimeout(() => router.replace('/dashboard'), 800);
      } catch {
        if (active) setStatus('error');
      }
    };

    void confirmEmail();

    return () => {
      active = false;
      if (redirectTimer) clearTimeout(redirectTimer);
    };
  }, [router]);

  const copy = STATUS_COPY[status];

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-warm-50 to-warm-100 px-4">
      <section className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 text-center">
        <div
          className={`w-14 h-14 mx-auto mb-5 rounded-full flex items-center justify-center text-2xl ${
            status === 'success'
              ? 'bg-green-100 text-green-700'
              : status === 'error'
                ? 'bg-red-100 text-red-700'
                : 'bg-primary-100 text-primary-700'
          }`}
          aria-hidden="true"
        >
          {status === 'success' ? '✓' : status === 'error' ? '!' : '…'}
        </div>

        <h1 className="text-xl font-semibold text-warm-900">{copy.title}</h1>
        <p className="mt-3 text-warm-600">{copy.detail}</p>

        {status === 'verifying' && (
          <div
            className="w-8 h-8 mx-auto mt-6 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"
            role="status"
            aria-label="正在验证"
          />
        )}

        {status === 'error' && (
          <button
            type="button"
            onClick={() => router.replace('/')}
            className="mt-6 w-full py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium"
          >
            返回登录
          </button>
        )}
      </section>
    </main>
  );
}
