# AI 持续优化指南（写给非开发同学）

> 用途：网页端上线后，如何不写代码地优化 AI 的生成质量和速度。
> 原则：**质量 → 改 SKILL.md（提示词）；速度 → 改配置（模型/知识库）**。

## 一、核心概念（30 秒）

| 东西 | 是什么 | 在哪 |
|---|---|---|
| SKILL.md | 每个功能的"人设 + 行为规则 + 输出格式"（纯文本提示词） | `skills/<功能>/SKILL.md` |
| 知识库 | AI 引用的事实素材（产品卡/违禁词/日历等） | `knowledge/` |
| 测试脚本 | 用固定用例跑 AI，看输出效果 | `scripts/test_skill.py` |
| 测试记录 | 每次测试的输入输出存档（自动按轮次追加） | `docs/测试记录/<功能>.md` |

## 二、生成质量不好 → 改 SKILL.md

1. 找到对应功能的 SKILL.md：`skills/热点雷达=hotspot-radar`、`乡土编剧=rural-scriptwriter`、`物料工坊=promo-materials`、`直播教练=live-coach`
2. 用记事本/VSCode 打开，改相关章节：
   - 输出格式不对 → 「输出格式模板」
   - 语气不像农户 → 「语言风格规则」
   - 老违规 → 「合规检查」或 `knowledge/广告法违禁词.md`
   - 产品事实错/缺 → `knowledge/产品卡/`
3. 注意：**只改文字，不要动 `---` 开头的 yaml 头（name/description）**，不要改文件结构

## 三、生成速度慢 → 改配置

- **换更快模型**（首选）：`web/.env` 中 `ARK_MODEL=doubao-seed-2-1-turbo-260628`
  （需先在火山方舟控制台开通该模型；开通后让开发测一下质量再换）
- **精简知识库**：`web/lib/skills.ts` 中每个功能的 `kbFiles` 数组，删掉该功能用不到的文件
  （例：物料工坊用不到「运营经验库」→ 已删，首 token 65s→43s）

## 四、测试方法（迭代循环）

```bash
# 在项目根目录（有 scripts/ 的地方）执行：
python scripts/test_skill.py --skill skills/promo-materials/SKILL.md --first   # 试第 1 条，快速验证
python scripts/test_skill.py --skill skills/promo-materials/SKILL.md --all     # 跑全部用例
```

- 测试用例清单：`scripts/test_cases.md`（可自行增删用例，每行一条）
- 结果自动存到 `docs/测试记录/promo-materials.md`（每次新轮次，可对比）
- **改 SKILL → 跑测试 → 对比新旧轮次 → 满意保留 / 不满意再改**

## 五、完整流程（照着做）

```
发现质量问题（海报价格错 / 语气书面 / 热点不相关）
  ↓
1. 改 skills/<功能>/SKILL.md 相关章节（或 knowledge/ 素材）
  ↓
2. python scripts/test_skill.py --skill skills/<功能>/SKILL.md --first
  ↓
3. 看 docs/测试记录/<功能>.md 新轮次，对比旧轮
  ↓
4. 满意 → 让开发重新构建上线（npm run build && npm start）
   不满意 → 回第 1 步
```

## 六、红线（不要动）

- `.env` 里的 API Key 别泄露、别提交 git
- 树仔菜永不推广、蜂蜜不提功效、极限词清零——这些是合规红线，改 SKILL 时别放宽
- SKILL.md 的 `description`（触发条件）不要大改，会影响功能识别
