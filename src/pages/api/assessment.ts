import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  const assessment = {
    project: {
      name: '记得',
      description: '面向逝者纪念、家庭记忆保存和 AI 陪伴交互的产品',
      version: '1.0.0',
      status: 'alpha',
    },
    tech_stack: {
      framework: 'Next.js 15',
      language: 'TypeScript',
      database: 'Supabase (PostgreSQL)',
      auth: 'Supabase Auth',
      ai: 'OpenAI (gpt-4o-mini)',
      voice: 'ElevenLabs',
    },
    features: [
      {
        id: 'auth',
        name: '用户认证',
        description: '邮箱注册、登录、验证',
        status: 'complete',
        test_url: '/api/health',
        endpoints: [
          { method: 'POST', path: '/auth/v1/signup', description: '注册' },
          { method: 'POST', path: '/auth/v1/token', description: '登录' },
          { method: 'POST', path: '/auth/v1/logout', description: '退出' },
        ],
      },
      {
        id: 'profile',
        name: '记忆体管理',
        description: '创建、查看、编辑、删除记忆体',
        status: 'complete',
        test_url: '/api/profile',
        endpoints: [
          { method: 'POST', path: '/api/profile', description: '创建记忆体' },
          { method: 'GET', path: '/api/profile', description: '获取记忆体' },
          { method: 'PUT', path: '/api/profile', description: '更新记忆体' },
          { method: 'DELETE', path: '/api/profile', description: '删除记忆体' },
        ],
      },
      {
        id: 'chat',
        name: 'AI 聊天',
        description: '基于记忆体描述的人格模拟聊天',
        status: 'complete',
        test_url: '/api/chat',
        endpoints: [
          { 
            method: 'POST', 
            path: '/api/chat', 
            description: 'AI 聊天',
            params: {
              profileId: '记忆体ID',
              message: '用户消息',
              model: 'gpt-4o-mini',
              temperature: '0-1',
              maxTokens: '1-1000（默认 600）',
            },
          },
        ],
      },
      {
        id: 'voice-clone',
        name: '声音克隆',
        description: '上传音频训练克隆声音',
        status: 'complete',
        test_url: '/api/voice-clone',
        endpoints: [
          { 
            method: 'POST', 
            path: '/api/voice-clone', 
            description: '创建声音克隆',
            params: {
              profileId: '记忆体ID',
              audioFiles: '音频文件数组',
            },
          },
        ],
      },
      {
        id: 'voice-synthesize',
        name: '语音合成',
        description: '文本转语音',
        status: 'complete',
        test_url: '/api/voice-synthesize',
        endpoints: [
          { 
            method: 'POST', 
            path: '/api/voice-synthesize', 
            description: '语音合成',
            params: {
              profileId: '记忆体ID',
              text: '要合成的文本',
            },
          },
        ],
      },
      {
        id: 'test-eval',
        name: '模型测试评估',
        description: '多模型对比测试和参数调整',
        status: 'complete',
        test_url: '/test-eval',
        endpoints: [],
      },
      {
        id: 'self-test',
        name: '综合自测',
        description: '全功能自动测试',
        status: 'complete',
        test_url: '/self-test',
        endpoints: [],
      },
    ],
    api_endpoints: [
      { method: 'GET', path: '/api/health', description: '健康检查' },
      { method: 'GET', path: '/api/voices', description: '当前用户人物的声音就绪状态' },
      { method: 'POST', path: '/api/profile', description: '创建/更新记忆体' },
      { method: 'GET', path: '/api/profile', description: '获取记忆体' },
      { method: 'DELETE', path: '/api/profile', description: '删除记忆体' },
      { method: 'POST', path: '/api/chat', description: 'AI聊天' },
      { method: 'POST', path: '/api/voice-clone', description: '声音克隆' },
      { method: 'POST', path: '/api/voice-synthesize', description: '语音合成' },
      { method: 'GET', path: '/api/assessment', description: '项目评估信息' },
    ],
    pages: [
      { path: '/', name: '登录页', description: '登录/注册入口' },
      { path: '/dashboard', name: '仪表盘', description: '记忆体列表' },
      { path: '/create-profile', name: '创建记忆体', description: '新建记忆体表单' },
      { path: '/chat', name: '聊天页', description: 'AI聊天界面' },
      { path: '/train-voice', name: '声音训练', description: '上传音频训练声音' },
      { path: '/test-eval', name: '模型测试', description: '模型对比测试' },
      { path: '/self-test', name: '综合自测', description: '全功能测试' },
    ],
    database: {
      tables: [
        { 
          name: 'memory_profiles', 
          columns: ['id', 'user_id', 'name', 'relation', 'gender', 'birth_date', 'short_description', 'voice_id'],
        },
        { 
          name: 'memory_materials', 
          columns: ['id', 'memory_profile_id', 'type', 'content', 'file_url'],
        },
      ],
      rls: '已配置行级安全策略',
    },
    configuration: {
      env_vars: [
        { name: 'NEXT_PUBLIC_SUPABASE_URL', required: true, configured: true },
        { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', required: true, configured: true },
        { name: 'OPENAI_API_KEY', required: true, configured: true },
        { name: 'ELEVENLABS_API_KEY', required: true, configured: true },
      ],
    },
    evaluation_criteria: {
      functionality: {
        max_score: 100,
        criteria: [
          { name: '认证系统完整性', weight: 20 },
          { name: '记忆体管理功能', weight: 20 },
          { name: 'AI聊天功能', weight: 20 },
          { name: '声音克隆功能', weight: 20 },
          { name: '测试评估功能', weight: 20 },
        ],
      },
      architecture: {
        max_score: 100,
        criteria: [
          { name: '架构设计合理性', weight: 25 },
          { name: '代码质量', weight: 25 },
          { name: '安全性', weight: 25 },
          { name: '性能优化', weight: 25 },
        ],
      },
      user_experience: {
        max_score: 100,
        criteria: [
          { name: '界面设计', weight: 25 },
          { name: '交互流畅度', weight: 25 },
          { name: '错误处理', weight: 25 },
          { name: '响应式设计', weight: 25 },
        ],
      },
    },
    test_instructions: {
      setup: '运行 npm run dev 启动开发服务器',
      base_url: 'http://localhost:3000',
      test_order: [
        '1. 访问 /api/health 检查数据库连接',
        '2. 访问 /api/voices 检查当前账号的声音就绪状态',
        '3. 创建测试用户（使用登录页）',
        '4. 创建测试记忆体（POST /api/profile）',
        '5. 测试聊天功能（POST /api/chat）',
        '6. 测试声音克隆（POST /api/voice-clone）',
        '7. 测试语音合成（POST /api/voice-synthesize）',
        '8. 访问 /self-test 运行综合测试',
      ],
    },
  };

  res.status(200).json(assessment);
}
