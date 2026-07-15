import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/router';
import { supabase } from '@/lib/supabase';
import type { MemoryProfile, MemoryMaterial } from '@/types';

interface UploadedFileSummary {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  status: string;
}

interface MaterialWithFile extends MemoryMaterial {
  uploaded_files?: UploadedFileSummary | null;
}

type AddMode = 'text' | 'file';

const ACCEPTED_FILES = [
  'image/jpeg', 'image/png', 'image/webp',
  'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/mp4',
  'video/mp4', 'video/webm',
  'application/pdf',
].join(',');

export default function MaterialsPage() {
  const { user, loading, getToken } = useAuth();
  const [profile, setProfile] = useState<MemoryProfile | null>(null);
  const [materials, setMaterials] = useState<MaterialWithFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>('text');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [newMaterial, setNewMaterial] = useState({ title: '', content: '' });
  const router = useRouter();
  const { id } = router.query;

  const authorizedFetch = useCallback(async (url: string, init: RequestInit = {}) => {
    const token = await getToken();
    if (!token) throw new Error('登录已失效，请重新登录');
    return fetch(url, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${token}`,
      },
    });
  }, [getToken]);

  const fetchProfile = useCallback(async () => {
    if (!id) return;
    const response = await authorizedFetch(`/api/profile?id=${encodeURIComponent(String(id))}`);
    if (response.ok) setProfile(await response.json());
  }, [authorizedFetch, id]);

  const fetchMaterials = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const response = await authorizedFetch(`/api/materials?profileId=${encodeURIComponent(String(id))}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '无法读取资料');
      setMaterials(data);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '无法读取资料');
    } finally {
      setIsLoading(false);
    }
  }, [authorizedFetch, id]);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
      return;
    }
    if (user && id) {
      fetchProfile();
      fetchMaterials();
    }
  }, [user, loading, id, router, fetchProfile, fetchMaterials]);

  const handleAddText = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!id || !newMaterial.title.trim() || !newMaterial.content.trim()) return;
    setIsSubmitting(true);
    clearMessages();

    try {
      const response = await authorizedFetch('/api/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: id,
          title: newMaterial.title,
          content: newMaterial.content,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '添加文字资料失败');
      setNewMaterial({ title: '', content: '' });
      setShowAddForm(false);
      setStatusMessage('文字资料已安全保存');
      await fetchMaterials();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '添加文字资料失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!id || !selectedFile || !rightsConfirmed) return;
    setIsSubmitting(true);
    clearMessages();

    try {
      setStatusMessage('正在申请私有上传空间…');
      const requestResponse = await authorizedFetch('/api/uploads/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: id,
          fileName: selectedFile.name,
          mimeType: selectedFile.type,
          fileSize: selectedFile.size,
          rightsConfirmed,
        }),
      });
      const requestData = await requestResponse.json();
      if (!requestResponse.ok) throw new Error(requestData.error || '无法创建上传任务');

      setStatusMessage('正在加密传输到私有隔离区…');
      const { error: uploadError } = await supabase.storage
        .from(requestData.bucket)
        .uploadToSignedUrl(requestData.path, requestData.token, selectedFile, {
          contentType: selectedFile.type,
          cacheControl: '0',
        });
      if (uploadError) throw new Error('文件上传失败，请重试');

      setStatusMessage('正在校验文件真实性和安全状态…');
      const completeResponse = await authorizedFetch('/api/uploads/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId: requestData.uploadId }),
      });
      const completeData = await completeResponse.json();
      if (!completeResponse.ok && completeResponse.status !== 202) {
        throw new Error(completeData.error || '文件校验失败');
      }

      setSelectedFile(null);
      setRightsConfirmed(false);
      setShowAddForm(false);
      setStatusMessage(
        completeResponse.status === 202
          ? '文件已进入隔离区，等待安全扫描后可用'
          : '文件已通过基础校验并成为记忆资料'
      );
      await fetchMaterials();
    } catch (error) {
      setStatusMessage('');
      setErrorMessage(error instanceof Error ? error.message : '上传失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePreview = async (file: UploadedFileSummary) => {
    clearMessages();
    try {
      const response = await authorizedFetch(`/api/uploads/download?id=${encodeURIComponent(file.id)}&mode=inline`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '无法打开文件');

      if (file.file_type === 'application/pdf') {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      } else {
        setPreviewUrls((current) => ({ ...current, [file.id]: data.url }));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '无法打开文件');
    }
  };

  const handleDownload = async (file: UploadedFileSummary) => {
    clearMessages();
    try {
      const response = await authorizedFetch(`/api/uploads/download?id=${encodeURIComponent(file.id)}&mode=download`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '无法下载文件');
      window.location.assign(data.url);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '无法下载文件');
    }
  };

  const handleDelete = async (materialId: string) => {
    if (!window.confirm('确定删除这项资料吗？相关文件也会被删除。')) return;
    clearMessages();
    try {
      const response = await authorizedFetch('/api/materials', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: materialId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '删除失败');
      setStatusMessage('资料已删除');
      await fetchMaterials();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '删除失败');
    }
  };

  const clearMessages = () => {
    setErrorMessage('');
    setStatusMessage('');
  };

  if (loading || !user) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-warm-50">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <button onClick={() => router.back()} className="text-warm-600 hover:text-warm-900">← 返回</button>
          <h1 className="text-xl font-semibold text-warm-900">记得</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-warm-900">{profile?.name} 的记忆资料</h2>
          <p className="text-warm-600 text-sm mt-1">
            文字、照片、声音、视频和文档共同决定记忆体是否真正“像”。
          </p>
        </div>

        {errorMessage && <Notice tone="error">{errorMessage}</Notice>}
        {statusMessage && <Notice tone="success">{statusMessage}</Notice>}

        <button
          onClick={() => { setShowAddForm((value) => !value); clearMessages(); }}
          className="w-full border-2 border-dashed border-primary-300 rounded-xl p-6 text-center hover:border-primary-400 hover:bg-primary-50 transition mb-6"
        >
          <span className="text-primary-600 font-medium">+ 添加记忆资料</span>
          <span className="block text-sm text-warm-500 mt-1">支持文字、图片、音频、视频和 PDF</span>
        </button>

        {showAddForm && (
          <section className="bg-white rounded-2xl shadow-sm p-6 mb-6">
            <div className="flex gap-2 mb-6">
              <ModeButton active={addMode === 'text'} onClick={() => setAddMode('text')}>文字故事</ModeButton>
              <ModeButton active={addMode === 'file'} onClick={() => setAddMode('file')}>图片 / 音频 / 视频 / PDF</ModeButton>
            </div>

            {addMode === 'text' ? (
              <form onSubmit={handleAddText} className="space-y-4">
                <input
                  type="text"
                  maxLength={200}
                  value={newMaterial.title}
                  onChange={(event) => setNewMaterial({ ...newMaterial, title: event.target.value })}
                  className="w-full px-4 py-3 border border-warm-200 rounded-lg outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="资料标题，例如：他总是怎么安慰我"
                  required
                />
                <textarea
                  value={newMaterial.content}
                  maxLength={20000}
                  onChange={(event) => setNewMaterial({ ...newMaterial, content: event.target.value })}
                  rows={7}
                  className="w-full px-4 py-3 border border-warm-200 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 resize-y"
                  placeholder="尽量记录具体的用词、语气、故事、习惯和当时的情境。"
                  required
                />
                <SubmitRow isSubmitting={isSubmitting} onCancel={() => setShowAddForm(false)} label="保存文字资料" />
              </form>
            ) : (
              <form onSubmit={handleFileUpload} className="space-y-5">
                <label className="block border-2 border-dashed border-warm-200 rounded-xl p-8 text-center cursor-pointer hover:border-primary-400 transition">
                  <span className="block text-warm-700 font-medium">选择私密记忆文件</span>
                  <span className="block text-sm text-warm-500 mt-2">JPG、PNG、WebP、MP3、WAV、OGG、M4A、MP4、WebM、PDF，最大 25MB</span>
                  <input
                    type="file"
                    accept={ACCEPTED_FILES}
                    onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>

                {selectedFile && (
                  <div className="bg-warm-50 rounded-lg p-4">
                    <div className="font-medium text-warm-800 break-all">{selectedFile.name}</div>
                    <div className="text-sm text-warm-500 mt-1">
                      {selectedFile.type || '未知类型'} · {formatBytes(selectedFile.size)}
                    </div>
                  </div>
                )}

                <label className="flex items-start gap-3 text-sm text-warm-700">
                  <input
                    type="checkbox"
                    checked={rightsConfirmed}
                    onChange={(event) => setRightsConfirmed(event.target.checked)}
                    className="mt-1"
                  />
                  <span>我确认有权上传和使用这份资料，并理解资料将被私密处理，用于构建该记忆体。</span>
                </label>

                <SubmitRow
                  isSubmitting={isSubmitting}
                  disabled={!selectedFile || !rightsConfirmed}
                  onCancel={() => setShowAddForm(false)}
                  label="上传并校验"
                />
                <p className="text-xs text-warm-500">
                  文件先进入私有隔离区。开发环境当前执行格式、大小和文件签名校验；生产发布前还必须接入恶意文件扫描服务。
                </p>
              </form>
            )}
          </section>
        )}

        <div className="grid grid-cols-1 gap-4">
          {isLoading ? <LoadingRows /> : materials.map((material) => (
            <MaterialCard
              key={material.id}
              material={material}
              previewUrl={material.uploaded_files ? previewUrls[material.uploaded_files.id] : undefined}
              onPreview={handlePreview}
              onDownload={handleDownload}
              onDelete={() => handleDelete(material.id)}
            />
          ))}

          {!isLoading && materials.length === 0 && (
            <div className="text-center py-12 bg-white rounded-xl">
              <p className="text-warm-500">还没有记忆资料</p>
              <p className="text-warm-400 text-sm mt-2">先加入一段真实故事、一张照片或一段自然语音。</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function MaterialCard({
  material,
  previewUrl,
  onPreview,
  onDownload,
  onDelete,
}: {
  material: MaterialWithFile;
  previewUrl?: string;
  onPreview: (file: UploadedFileSummary) => void;
  onDownload: (file: UploadedFileSummary) => void;
  onDelete: () => void;
}) {
  const file = material.uploaded_files;
  return (
    <article className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h3 className="text-lg font-medium text-warm-900 break-all">{material.title}</h3>
          <span className="inline-block text-xs px-2 py-1 mt-2 bg-warm-100 text-warm-600 rounded-full">
            {materialTypeLabel(material.type)}
          </span>
        </div>
        <button onClick={onDelete} className="text-sm text-red-500 hover:text-red-700">删除</button>
      </div>

      {material.content && <p className="text-warm-600 mb-4 whitespace-pre-wrap">{material.content}</p>}

      {file && (
        <div className="border border-warm-100 rounded-lg p-4 mb-4">
          <div className="text-sm text-warm-600">{file.file_type} · {formatBytes(file.file_size)}</div>
          {file.status === 'ready' ? (
            <div className="flex gap-3 mt-3">
              <button onClick={() => onPreview(file)} className="text-sm text-primary-600 hover:text-primary-700">预览</button>
              <button onClick={() => onDownload(file)} className="text-sm text-primary-600 hover:text-primary-700">下载</button>
            </div>
          ) : (
            <p className="text-sm text-amber-600 mt-2">正在隔离处理：{file.status}</p>
          )}

          {previewUrl && material.type === 'image' && (
            // Signed private URLs are short-lived and cannot use the Next image optimizer safely.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt={material.title} className="mt-4 max-h-96 rounded-lg object-contain" />
          )}
          {previewUrl && material.type === 'audio' && (
            <audio src={previewUrl} controls className="w-full mt-4">您的浏览器不支持音频播放。</audio>
          )}
          {previewUrl && material.type === 'video' && (
            <video src={previewUrl} controls className="w-full max-h-[32rem] mt-4 rounded-lg">您的浏览器不支持视频播放。</video>
          )}
        </div>
      )}

      <time className="text-warm-400 text-sm">{new Date(material.created_at).toLocaleString('zh-CN')}</time>
    </article>
  );
}

function SubmitRow({
  isSubmitting,
  disabled,
  onCancel,
  label,
}: {
  isSubmitting: boolean;
  disabled?: boolean;
  onCancel: () => void;
  label: string;
}) {
  return (
    <div className="flex gap-3 justify-end">
      <button type="button" onClick={onCancel} className="px-4 py-2 border border-warm-200 rounded-lg text-warm-700">取消</button>
      <button
        type="submit"
        disabled={isSubmitting || disabled}
        className="px-5 py-2 bg-primary-600 text-white rounded-lg disabled:opacity-50"
      >
        {isSubmitting ? '处理中…' : label}
      </button>
    </div>
  );
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm ${active ? 'bg-primary-600 text-white' : 'bg-warm-100 text-warm-700'}`}
    >
      {children}
    </button>
  );
}

function Notice({ tone, children }: { tone: 'error' | 'success'; children: React.ReactNode }) {
  return (
    <div className={`mb-6 px-4 py-3 rounded-lg ${tone === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
      {children}
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-warm-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="flex justify-center py-8">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
    </div>
  );
}

function materialTypeLabel(type: MemoryMaterial['type']) {
  return ({ text: '文字', image: '图片', audio: '音频', video: '视频', document: '文档' } as const)[type];
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
