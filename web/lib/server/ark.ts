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
  const parts = [skill];
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
  const bgResp = await fetch(`${ARK_BASE}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.ARK_API_KEY}`,
    },
    body: JSON.stringify({
      model: imageModel,
      prompt: fields.bgPrompt,
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
    imageUrl: `/generated/${path.basename(outPath)}`,
    note: "海报已生成",
  };
}
