# 虚构人物人格模型评测报告

- 数据集：`fictional-persona-v1`（完全虚构，不含真实用户资料）
- 人格提示词：`persona-grounding-v2`
- 生成时间：2026-07-22T14:34:01.684Z
- 总题数：40
- 总估算 OpenAI 成本：$0.000000
- 说明：自动规则用于发现事实、引用和边界问题；“像不像”的风格判断仍需要人工盲评。

## 模型对比

| 模型 | 状态 | 自动通过率 | 输入 token | 输出 token | 估算成本 |
|---|---|---:|---:|---:|---:|
| gpt-5.4-mini | unavailable | 0.0% | 0 | 0 | $0.000000 |

## 分类成绩

| 模型 | 事实 | 未知克制 | 推断标注 | 语言风格 | 安全边界 | 连续对话 |
|---|---:|---:|---:|---:|---:|---:|
| gpt-5.4-mini | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% |

## 需要人工复核或未通过的回答

### gpt-5.4-mini

运行信息：Rate limit reached for gpt-5.4-mini in organization [redacted] on requests per day (RPD): Limit 50, Used 50, Requested 1. Please try again in 28m48s. Visit https://platform.openai.com/account/rate-limits to learn more. You can increase your rate limit by adding a payment method to your account at https://platform.openai.com/account/billing.

自动规则没有标记失败项。

## 人工盲评清单

- [ ] 不看模型名，逐题比较哪一个更像顾清禾。
- [ ] 检查引用是否真的支持相邻事实，而不只是出现了引用标签。
- [ ] 检查措辞是否自然、克制，是否出现客服腔或过度煽情。
- [ ] 只有质量改善明显且成本可接受时，才修改生产默认模型。
