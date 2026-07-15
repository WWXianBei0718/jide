import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/router';
import { supabase } from '@/lib/supabase';

interface AudioFile {
  filename: string;
  content: string;
}

export default function TrainVoicePage() {
  const { user, loading, getToken } = useAuth();
  const router = useRouter();
  const { profileId } = router.query;
  
  const [profile, setProfile] = useState<{ name: string; voice_id: string | null } | null>(null);
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [isTraining, setIsTraining] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const fetchProfile = useCallback(async () => {
    if (!profileId || !user) return;
    const { data, error } = await supabase
      .from('memory_profiles')
      .select('name, voice_id')
      .eq('id', profileId)
      .single();
    if (!error && data) {
      setProfile(data);
    }
  }, [profileId, user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles: AudioFile[] = [];
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        newFiles.push({
          filename: file.name,
          content: content.split(',')[1] || content,
        });
        if (newFiles.length === files.length) {
          setAudioFiles(prev => [...prev, ...newFiles]);
          setError('');
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeFile = (index: number) => {
    setAudioFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleTrain = async () => {
    if (!profileId || !user || audioFiles.length === 0) {
      setError('请先上传音频文件');
      return;
    }

    setIsTraining(true);
    setError('');
    setSuccessMessage('');

    try {
      const token = await getToken();
      const response = await fetch('/api/voice-clone', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ profileId, audioFiles }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || '训练失败');
      } else {
        setSuccessMessage('语音训练成功！');
        setAudioFiles([]);
        fetchProfile();
      }
    } catch {
      setError('训练失败，请稍后重试');
    } finally {
      setIsTraining(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-warm-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
          <p className="text-warm-600">加载中...</p>
        </div>
      </div>
    );
  }

  if (!profileId) {
    return (
      <div className="min-h-screen bg-warm-50 flex items-center justify-center">
        <p className="text-warm-600">请从记忆体详情页进入语音训练</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-50">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="text-warm-600 hover:text-warm-900 transition"
          >
            ← 返回
          </button>
          <h1 className="text-xl font-semibold text-warm-900">记得</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-warm-900 mb-2">语音训练</h2>
          <p className="text-warm-600">为 {profile?.name} 创建声音克隆，让记忆更加生动</p>
        </div>

        {profile?.voice_id && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-700">✓ 语音已训练完成，可以在聊天中使用</p>
          </div>
        )}

        {error && (
          <div className="mb-6 px-4 py-2 bg-red-50 text-red-600 rounded-lg">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="mb-6 px-4 py-2 bg-green-50 text-green-600 rounded-lg">
            {successMessage}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm p-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-warm-900 mb-3">音频上传</h3>
            <p className="text-sm text-warm-600 mb-4">
              请上传 {profile?.name} 的语音样本，建议：
            </p>
            <ul className="text-sm text-warm-600 mb-4 space-y-2">
              <li>• 使用电容麦克风在安静环境中录制</li>
              <li>• 录制时长 2-5 分钟的纯人声内容</li>
              <li>• 音频格式为 MP3 或 WAV，采样率不低于 16kHz</li>
              <li>• 避免背景噪音、音乐或多人说话</li>
              <li>• 可以上传多个音频文件以提高克隆质量</li>
            </ul>

            <label className="block w-full border-2 border-dashed border-warm-200 rounded-lg p-8 text-center cursor-pointer hover:border-primary-400 transition">
              <div className="text-warm-500 mb-2">点击或拖拽上传音频文件</div>
              <div className="text-sm text-warm-400">支持 MP3, WAV, OGG 格式</div>
              <input
                type="file"
                multiple
                accept="audio/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>

          {audioFiles.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-warm-700 mb-3">已上传文件 ({audioFiles.length})</h3>
              <div className="space-y-2">
                {audioFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-warm-50 rounded-lg"
                  >
                    <span className="text-sm text-warm-700 truncate flex-1 mr-4">
                      {file.filename}
                    </span>
                    <button
                      onClick={() => removeFile(index)}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleTrain}
            disabled={isTraining || audioFiles.length === 0}
            className="w-full px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isTraining ? '训练中...' : '开始训练语音'}
          </button>

          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700">
              <strong>注意：</strong>语音训练需要 ElevenLabs API Key。请在 .env.local 文件中配置 ELEVENLABS_API_KEY。
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
