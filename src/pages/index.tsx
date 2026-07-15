import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/router';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { loading, signIn, signUp, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.push('/dashboard');
    }
  }, [user, router]);

  useEffect(() => {
    const handleHash = async () => {
      const hash = window.location.hash;
      if (hash.includes('access_token') || hash.includes('code')) {
        setTimeout(async () => {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            router.push('/dashboard');
          }
        }, 500);
      }
    };
    handleHash();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsSubmitting(true);

    if (!email || !password) {
      setError('请填写邮箱和密码');
      setIsSubmitting(false);
      return;
    }

    try {
      if (isSignUp) {
        const { error: signupError } = await signUp(email, password);
        if (signupError) {
          setError(signupError.message);
        } else {
          setMessage('注册成功，请检查邮箱验证');
        }
      } else {
        const { error: signinError } = await signIn(email, password);
        if (signinError) {
          setError(signinError.message);
        }
      }
    } catch (err) {
      setError('网络错误，请稍后重试');
    }
    setIsSubmitting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-50">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
          <p className="text-warm-600">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-warm-50 to-warm-100">
      <div className="w-full max-w-md mx-4">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-primary-100 rounded-full flex items-center justify-center">
            <span className="text-3xl">?</span>
          </div>
          <h1 className="text-2xl font-semibold text-warm-900">记得</h1>
          <p className="text-warm-600 mt-2">留存珍贵记忆，延续永恒思念</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-xl font-medium text-warm-900 mb-6">
            {isSignUp ? '创建账号' : '登录'}
          </h2>

          {error && (
            <div className="mb-4 px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm">
              {error}
            </div>
          )}

          {message && (
            <div className="mb-4 px-4 py-2 bg-green-50 text-green-600 rounded-lg text-sm">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-warm-700 mb-1">
                邮箱
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
                placeholder="请输入邮箱"
                disabled={isSubmitting}
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-warm-700 mb-1">
                密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
                placeholder="请输入密码"
                disabled={isSubmitting}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                  {isSignUp ? '注册中...' : '登录中...'}
                </span>
              ) : (
                isSignUp ? '注册' : '登录'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              disabled={isSubmitting}
              className="text-primary-600 hover:text-primary-700 font-medium disabled:opacity-50"
            >
              {isSignUp ? '已有账号？登录' : '还没有账号？注册'}
            </button>
          </div>
        </div>

        <p className="text-center text-warm-500 text-sm mt-6">
          &copy; 2026 记得. 用心守护每一份记忆.
        </p>
      </div>
    </div>
  );
}
