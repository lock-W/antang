/**
 * 服务端：火山方舟（豆包 / Seedream）API 调用
 *
 * 只允许在服务端使用（API 路由），绝不在前端引入——API Key 只存在服务端 .env。
 *
 * 链路（照抄 scripts/test_skill.py 的逻辑）：
 *   读 SKILL.md + 知识库 → 拼 system prompt → chat.completions → 回显
 *   若回复含【海报数据包】且配置了图像模型 → 生成背景图 → python 渲染文字 → 返回图片 URL
 */

import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";

import type { FeatureConfig } from "../skills";
import {
  extractPosterBlocks,
  parsePosterFields,
  type PosterFields,
  type PosterResult,
} from "../poster";

const execFileAsync = promisify(execFile);

/** 项目根目录（web/ 的上一级，存 skills/ knowledge/ scripts/） */
export const PROJECT_ROOT = path.resolve(
  process.env.PROJECT_ROOT || path.join(process.cwd(), "..")
);

export const ARK_BASE = "https://ark.cn-beijing.volces.com/api/v3";

export function isMockMode(): boolean {
  return !process.env.ARK_API_KEY;
}

export function getModel(): string {
  return process.env.ARK_MODEL || "";
}

export function getImageModel(): string {
  return process.env.ARK_IMAGE_MODEL || "";
}

/** 读 SKILL.md + 知识库文件，拼成 system prompt（与 test_skill.py build_system_prompt 一致） */
export async function buildSystemPrompt(feature: FeatureConfig): Promise<string> {
  const skillPath = path.join(PROJECT_ROOT, feature.skillPath);
  let skill: string;
  try {
    skill = await fs.readFile(skillPath, "utf-8");
  } catch {
    throw new Error(`技能文件缺失：${feature.name}（${feature.skillPath}）`);
  }
  // 注入服务器真实当前日期：模型自身不知道"今天"，时令日历/热点推荐会瞎猜日期
  // （实测曾把 8 月 30 日说成 8 月 17 日——从知识库示例里抄的）
  const now = new Date();
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const today = `${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日（星期${weekdays[now.getDay()]}）`;
  const parts = [
    skill,
    `\n\n===== 当前时间 =====\n\n今天是 ${today}。所有涉及"今天/最近/时令/日期"的判断，以此日期为准，禁止使用知识库示例中出现的日期。`,
    `\n\n===== 运行纪律 =====\n\n若输入（如热榜条目）中含有你无法回应、不宜讨论、政治敏感、灾难伤亡、娱乐八卦、争议对立类内容：直接忽略这些条目即可，不要拒绝回答，不要说"无法回答/不能帮助"，按本技能的正常流程继续输出（轨道 A 时令日历选题永远可用；一条都推荐不出时按技能规定如实说明"今日热榜无合适话题，建议跟随时令日历"）。`,
    `\n\n===== 输出格式纪律 =====\n\n必须严格按照本技能 SKILL.md 中规定的输出格式模板输出结构化内容，禁止用大段叙述文字替代。例如：热点雷达必须输出 "## 今日选题推荐" 下恰好 3 张 "### 卡片 N ｜ 类型" 卡片，每张卡片必须包含 - **话题名称**/- **结合角度**/- **适配产品**/- **推荐形式**/- **一句话理由**/- **下一步** 字段；物料工坊的海报必须输出【海报数据包】字段块；乡土编剧的脚本必须含分镜表；直播教练必须含五环节时间轴。输入缺失（如用户没提供热榜）时，按技能规定的降级流程正常输出（如只出时令日历卡片），不要在回复里解释或抱怨输入情况。`,
  ];
  for (const kb of feature.kbFiles) {
    try {
      const content = await fs.readFile(path.join(PROJECT_ROOT, kb), "utf-8");
      parts.push(`\n\n===== 知识库文件：${path.basename(kb)} =====\n\n${content}`);
    } catch {
      // 知识库缺失不中断，仅提示
      parts.push(`\n\n===== 知识库文件：${path.basename(kb)} =====\n\n（文件缺失，请补充）`);
    }
  }
  return parts.join("");
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * 热榜敏感条目过滤（程序层兜底）
 *
 * 背景：2026-08-30 实测——热点雷达点「刷新今日热榜」后，真实热榜含大量政治/灾难/
 * 负面条目（领导人新闻、中央纪委、泥石流、坠河、毁容针、肝吸虫、明星八卦等），
 * 模型看到密集敏感内容会触发自身安全拒答（"无法回答"），根本走不到 SKILL 的过滤流程。
 * 修复：在把热榜发给模型前，程序化剔除高危条目；SKILL 的过滤逻辑照常再过滤一轮。
 * 只对"这是今天的热榜"形式的文本生效，普通用户消息不受影响。
 */
const HOTLIST_BLOCK_KEYWORDS = [
  // 政治 / 领导人 / 政务
  "习近平", "中央纪委", "纪委", "总书记", "国务院", "外交部", "外交", "上合", "峰会",
  "当选", "政协", "人大", "中央", "书记", "部长", "主席",
  // 灾难 / 事故 / 救援
  "泥石流", "洪水", "地震", "坠河", "坠机", "坠毁", "遇难", "遇害", "伤亡", "救援",
  "抢险", "失联", "火灾", "爆炸", "滑坡", "冰崩", "受灾", "台风",
  // 负面健康 / 医疗黑幕
  "中毒", "肝吸虫", "病毒", "癌症", "毁容", "死亡", "尸体", "确诊", "疫情", "传染病",
  "百草枯", "疾病",
  // 娱乐八卦 / 争议
  "王菲", "梅艳芳", "明星", "离婚", "绯闻", "演唱会", "艺人", "遗产", "谴责", "辟谣",
  "犯罪", "遇害",
];

export function sanitizeHotlistText(text: string): string {
  if (!/这是今天的热榜/.test(text)) return text;
  const lines = text.split("\n");
  const kept = lines.filter((line) => {
    const t = line.trim();
    if (!t) return true;
    return !HOTLIST_BLOCK_KEYWORDS.some((k) => t.includes(k));
  });
  // 防过滤到空：兜底保留前 3 行
  if (kept.length < 2) {
    return lines.filter((l) => l.trim()).slice(0, 3).join("\n");
  }
  return kept.join("\n");
}

/**
 * 调用豆包文本模型（OpenAI 兼容端点，SSE 流式）
 * - 传了 onDelta 时逐 chunk 回调增量文本（用于网页端流式上屏）
 * - 返回完整回复文本
 * - 超时 300s：实测 doubao-seed-evolving 带完整知识库（2.4 万字 system prompt）
 *   首 token 耗时可超 120s（实测 116s+），120s 会误杀正常请求（2026-08 实测）
 */
export async function callChat(
  model: string,
  messages: ChatMessage[],
  onDelta?: (delta: string) => void
): Promise<string> {
  const resp = await fetch(`${ARK_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.ARK_API_KEY}`,
    },
    body: JSON.stringify({ model, messages, stream: true }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`方舟 API 错误 ${resp.status}: ${detail.slice(0, 300)}`);
  }
  if (!resp.body) throw new Error("方舟 API 返回为空");

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") break;
      try {
        const chunk = JSON.parse(payload) as {
          choices?: { delta?: { content?: string } }[];
        };
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          onDelta?.(delta);
        }
      } catch {
        // 忽略不完整/非 JSON 行（心跳等）
      }
    }
  }
  if (!full) throw new Error("方舟 API 返回为空");
  return full;
}

/**
 * 海报管线：对每个海报数据包依次走「Seedream 生成背景图 → python render_poster.py
 * 渲染文字 → 输出图片 URL」。一次回复可含多个数据包（如【海报数据包 1/2】【2/2】），
 * 单个包失败不中断其他包（该包 note 记录原因）。任何一步失败都返回带备注的结果，不抛异常中断对话。
 */
export async function generatePoster(
  reply: string,
  imageModel: string
): Promise<PosterResult[]> {
  const blocks = extractPosterBlocks(reply);
  const parsed = blocks.map((b) => parsePosterFields(b));
  if (parsed.every((f) => f === null)) {
    return [{ imageUrl: null, note: "海报数据包解析失败" }];
  }

  const results: PosterResult[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const fields = parsed[i];
    if (!fields) continue; // 无模板编号的块跳过（前端同样过滤，保持索引对齐）
    try {
      results.push(await renderOnePoster(fields, blocks[i], imageModel, i));
    } catch (e) {
      results.push({
        imageUrl: null,
        note: `海报生成失败：${String(e).slice(0, 200)}`,
      });
    }
  }
  return results;
}

/** 渲染单个海报数据包（Seedream 背景图 + python 文字渲染） */
async function renderOnePoster(
  fields: PosterFields,
  block: string,
  imageModel: string,
  index: number
): Promise<PosterResult> {
  if (!fields.bgPrompt) {
    return { imageUrl: null, note: "海报数据包缺少背景图生成提示词，跳过图片生成" };
  }

  // 1) Seedream 生成背景图（1728x2304 竖版 3:4，决策 D-04）
  const outDir = path.join(process.cwd(), "public", "generated");
  await fs.mkdir(outDir, { recursive: true });
  const stamp = `${Date.now()}_${index}`;
  const bgPath = path.join(outDir, `bg_${stamp}.png`);
  // 强制"画面无文字"约束：模型写的提示词偶有遗漏，AI 会在促销风画面里自己画上
  // 价格标签/文字（实测画出过 ¥199 的假价格，与程序渲染的真实价格冲突）——程序侧统一兜底
  const NO_TEXT_SUFFIX =
    " Absolutely no text, no letters, no numbers, no digits, no price tags, no signs, no labels, no watermark anywhere in the image.";
  const bgResp = await fetch(`${ARK_BASE}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.ARK_API_KEY}`,
    },
    body: JSON.stringify({
      model: imageModel,
      prompt: fields.bgPrompt + NO_TEXT_SUFFIX,
      size: "1728x2304",
      response_format: "b64_json",
      watermark: false,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!bgResp.ok) {
    const detail = await bgResp.text().catch(() => "");
    if (detail.includes("ModelNotOpen")) {
      return {
        imageUrl: null,
        note: "图像模型未开通，请到火山方舟控制台开通 Seedream 图像模型；以下为海报文字内容，可人工制图。",
      };
    }
    return { imageUrl: null, note: `背景图生成失败：${bgResp.status}` };
  }
  const bgData = (await bgResp.json()) as {
    data?: { b64_json?: string; url?: string }[];
  };
  const datum = bgData.data?.[0];
  if (datum?.b64_json) {
    await fs.writeFile(bgPath, Buffer.from(datum.b64_json, "base64"));
  } else if (datum?.url) {
    const img = await fetch(datum.url);
    await fs.writeFile(bgPath, Buffer.from(await img.arrayBuffer()));
  } else {
    return { imageUrl: null, note: "背景图返回格式异常" };
  }

  // 2) python 渲染文字（复用 scripts/render_poster.py）
  // 只把当前数据包块通过临时文件传给 python（多块回复时逐块渲染；
  // execFile 的 options 不支持 input 字段）
  const outPath = path.join(outDir, `poster_${stamp}.png`);
  const blockFile = path.join(outDir, `reply_${stamp}.txt`);
  await fs.writeFile(blockFile, block, "utf-8");
  const script = [
    "import sys",
    "from pathlib import Path",
    "sys.path.insert(0, 'scripts')",
    "from render_poster import parse_poster_fields, render_poster",
    "block = open(sys.argv[3], encoding='utf-8').read()",
    "fields = parse_poster_fields(block)",
    // 注意：python -c 单行脚本里分号后不能跟 if 等复合语句，用 assert 代替
    "assert fields, 'parse failed'",
    "render_poster(fields, Path(sys.argv[1]), Path(sys.argv[2]))",
  ].join("; ");
  try {
    await execFileAsync(
      process.env.PYTHON || "python",
      ["-c", script, bgPath, outPath, blockFile],
      { cwd: PROJECT_ROOT, timeout: 60_000 }
    );
  } catch (e) {
    return { imageUrl: null, note: `海报文字渲染失败（需服务器装 Python + Pillow）：${String(e).slice(0, 200)}` };
  } finally {
    await fs.unlink(blockFile).catch(() => {});
  }

  // 渲染成功，删除背景图中间文件（bg_*.png），只留 poster_*.png 成品
  await fs.unlink(bgPath).catch(() => {});

  return {
    // 生产模式 public/ 构建后新增文件 404，成品图统一走 /api/generated/ 动态路由
    imageUrl: `/api/generated/${path.basename(outPath)}`,
    note: "海报已生成",
  };
}
