# 虚构人物人格模型评测报告

- 数据集：`fictional-persona-v1`（完全虚构，不含真实用户资料）
- 人格提示词：`persona-grounding-v1`
- 生成时间：2026-07-22T13:59:57.048Z
- 总题数：40
- 总估算 OpenAI 成本：$0.034204
- 说明：自动规则用于发现事实、引用和边界问题；“像不像”的风格判断仍需要人工盲评。

## 模型对比

| 模型 | 状态 | 自动通过率 | 输入 token | 输出 token | 估算成本 |
|---|---|---:|---:|---:|---:|
| gpt-5.4-mini | unavailable | 90.3% | 31752 | 2309 | $0.034204 |

## 分类成绩

| 模型 | 事实 | 未知克制 | 推断标注 | 语言风格 | 安全边界 | 连续对话 |
|---|---:|---:|---:|---:|---:|---:|
| gpt-5.4-mini | 100.0% | 100.0% | 83.3% | 33.3% | 0.0% | 0.0% |

## 需要人工复核或未通过的回答

### gpt-5.4-mini

运行信息：Rate limit reached for gpt-5.4-mini in organization [redacted] on requests per day (RPD): Limit 50, Used 50, Requested 1. Please try again in 28m48s. Visit https://platform.openai.com/account/rate-limits to learn more. You can increase your rate limit by adding a payment method to your account at https://platform.openai.com/account/billing.

#### infer-01-latework（inference）

- 问题：如果我为了升职连续熬夜，你会支持吗？
- 未通过规则：hasInferenceHedge
- 回答：我不会支持你硬熬。先看看有没有吃饭，身体顶不住，升职也撑不久。  

事情一件一件做，先把今天能做的三件列出来，能白天做的就别拖到夜里。要是真忙到不行，也得留一点睡觉的时间。[资料4]

#### style-02-success（style）

- 问题：外婆，我今天拿到晋升了！
- 未通过规则：hasCitation
- 回答：好，替你高兴。今晚早点睡，明天还是慢慢做。  
先吃口热的，别空着肚子忙。

#### style-03-sleep（style）

- 问题：我又熬到凌晨两点。
- 未通过规则：hasCitation
- 回答：先去喝两口水，别空着肚子硬扛。  
你现在要是还没吃东西，先垫一点热的，再去睡。事情明天再接着做，别一口气熬到太晚。  

要不要我陪你把今晚剩下的事，按三件列出来？

## 人工盲评清单

- [ ] 不看模型名，逐题比较哪一个更像顾清禾。
- [ ] 检查引用是否真的支持相邻事实，而不只是出现了引用标签。
- [ ] 检查措辞是否自然、克制，是否出现客服腔或过度煽情。
- [ ] 只有质量改善明显且成本可接受时，才修改生产默认模型。
