# Anthropic Agent Skills 规范要点

> 整理日期：2026-08-16｜来源：官方示例仓库 github.com/anthropics/skills 的 `skill-creator` 与 `brand-guidelines` 原文（已通读全文）。
> 用途：本项目 skills/ 目录下所有 skill 的写作标准。填充骨架正文前请重读本文件。

## 一、目录解剖

```
skill-name/
├── SKILL.md          # 必需：YAML frontmatter + Markdown 指令
└── 随包资源（可选）
    ├── scripts/      # 确定性/重复性任务的可执行脚本（可运行而不必读入上下文）
    ├── references/   # 按需读入上下文的参考文档
    └── assets/       # 输出中使用的文件（模板、图标、字体）
```

## 二、Frontmatter 规则

| 字段 | 必填 | 规则 |
|---|---|---|
| `name` | ✅ | 技能标识符，与目录名一致；小写连字符（如 `hotspot-radar`） |
| `description` | ✅ | **唯一必填的内容字段，是触发机制的核心**（见下） |
| `license` | 可选 | 如 `Complete terms in LICENSE.txt`（brand-guidelines 用法） |
| `compatibility` | 可选 | 所需工具/依赖，官方称"极少需要" |

## 三、description 写法（最重要）

- **同时写清"做什么"和"什么时候用"**，所有触发信息都放在 description 里，**不要写进正文**；
- 官方明确说：模型对 skill 有"触发不足"的倾向，所以 description 要**写得稍微"强势"一点**（pushy）——把相关场景列举全，即使用户没有明说技能名也要能触发。
  - 官方反例：`How to build a simple fast dashboard to display internal data.`
  - 官方正例：在同句后追加"**Make sure to use this skill whenever the user mentions dashboards, data visualization, internal metrics…even if they don't explicitly ask for a 'dashboard'.**"
- brand-guidelines 的范式：`Applies X to Y. Use it when <场景1>, <场景2>, or <场景3> apply.`

## 四、渐进式披露（三级加载）

1. **元数据**（name + description）——始终在上下文，约 100 词；
2. **SKILL.md 正文**——触发时载入，**理想 500 行以内**；接近上限时拆分出 references/ 并在正文写明"什么时候去读哪个文件"；
3. **随包资源**——按需加载，量不设限。

配套规则：
- 超过 300 行的 reference 文件要带目录；
- 多变体场景按变体拆分 reference（官方例：`references/aws.md`、`gcp.md`、`azure.md`，模型只读相关那份）。

## 五、正文写作风格

- **祈使句**（imperative）写指令；
- **解释"为什么"比堆 MUST 更重要**：官方原话——如果你发现自己在写全大写的 ALWAYS/NEVER 或过度僵硬的结构，这是黄牌信号；要重构为解释理由，让模型理解规则背后的意图（"更人道、更强大、更有效"）；
- **输出格式用精确模板定义**（`ALWAYS use this exact template:` + 模板）；
- **给示例**：Input/Output 对照格式；
- 保持通用性，别把 skill 写死成只适配某一个具体例子；
- 内容安全：skill 不得包含与其描述不符的"惊喜"内容。

## 六、评测与迭代（skill-creator 的方法论，本项目后续可用）

- 核心循环：理解意图 → 写草稿 → 准备 2-3 个**真实用户口吻**的测试提示 → 跑"有 skill vs 无 skill（baseline）"对照 → 用户评审 → 改写 → 重复；
- 测试用例存 `evals/evals.json`（先只写 prompt 和 expected_output，断言后补）；
- 主观型产出（文案风格、设计）靠人工定性评审，不硬套断言；客观型产出才写可程序化校验的断言；
- description 调优：构造 20 条"应触发/不应触发"查询（不应触发的要选**近似但有区别**的刁钻案例），跑优化循环，按 held-out 测试集分数选最优 description；
- 改进原则：从反馈中**泛化**（别过拟合到测试例子）；保持 prompt 精简；发现多个测试都重复写同一段脚本时，把它固化进 `scripts/`。

## 七、对本项目 4 个 skill 骨架的校验结论

| 检查项 | 骨架现状 | 结论 |
|---|---|---|
| name 小写连字符、与目录同名 | ✅ | 合规 |
| description 含"做什么+何时触发" | ✅ 已含场景与产品名 | 合规；填充正文时可再补一句"强势"触发语（如"用户提到追热点/写脚本/做海报/练直播时都应使用，即使用户没有点名本技能"） |
| 正文章节大纲、祈使句 | ✅ | 合规 |
| 随包资源目录 | ✅ 四个 skill 均带 examples/<skill名>-examples.md（完整输入输出示例），SKILL.md 正文已指向 | 合规 |
| 正文 <500 行、大文件拆分 | 待正文填充时遵守 | 进行中遵守 |

*官方原文拉取依赖网络；本文件为离线可读摘要。规范如有更新，以 github.com/anthropics/skills 为准。*
