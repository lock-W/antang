/**
 * POST /api/chat（SSE 流式）
 *
 * 请求：{ feature: FeatureId, messages: {role,content}[] }
 *  - messages 为不含 system 的历史消息（最后一条是用户最新消息）
 *  - 服务端会过滤非法消息（role 仅保留 user/assistant，content 须为字符串），
 *    最多保留最近 50 条、单条 content 截断到 4000 字符
 *
 * 响应：Content-Type: text/event-stream
 *  data: {"type":"delta","text":"..."}                          文本增量
 *  data: {"type":"rendering"}                                   文本完毕，正在渲染海报
 *  data: {"type":"done","posters":[{imageUrl,note}...]}         结束（无海报则空数组）
 *  data: {"type":"error","message":"..."}                       出错
 *  data: [DONE]                                                 流终止
 *
 * 无 ARK_API_KEY 时走 mock（lib/mock.ts 的真实测试样例），同样以 SSE 协议返回。
 * 有 Key 时：读 SKILL.md + 知识库 → 拼 system prompt → 调豆包 → 流式回显；
 * 若回复含【海报数据包】且配置了 ARK_IMAGE_MODEL，自动走海报管线返回图片 URL。
 */

import { NextResponse } from "next/server";

import { FEATURES, type FeatureId } from "@/lib/skills";
import { hasPosterBlock, parsePostersFromReply, type PosterResult } from "@/lib/poster";
import { getMockReply } from "@/lib/mock";
import {
  buildSystemPrompt,
  callChat,
  generatePoster,
  getImageModel,
  getModel,
  isMockMode,
  sanitizeHotlistText,
} from "@/lib/server/ark";

export const runtime = "nodejs";
// 模型首 token 实测可超 120s（见 lib/server/ark.ts callChat 注释），给足 300s
export const maxDuration = 300;

interface ChatRequestBody {
  feature: FeatureId;
  messages: { role: "user" | "assistant"; content: string }[];
}

const MAX_MESSAGES = 50;
const MAX_CONTENT_LEN = 4000;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
};

/** 服务端清洗消息：role 只留 user/assistant，content 非字符串丢弃；限 50 条 / 4000 字 */
function sanitizeMessages(raw: unknown): { role: "user" | "assistant"; content: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
        !!m &&
        typeof m === "object" &&
        ((m as { role?: unknown }).role === "user" ||
          (m as { role?: unknown }).role === "assistant") &&
        typeof (m as { content?: unknown }).content === "string"
    )
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CONTENT_LEN) }));
}

/** 把异常转成给用户看的人话 */
function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[chat]", msg);
  if (msg.includes("技能文件缺失")) return msg;
  if (msg.includes("方舟 API")) return "模型繁忙，请稍后重试";
  return "服务开小差了，请稍后重试";
}

/** 构造一个 SSE Response；body 回调里用 send() 发事件 */
function sseResponse(body: (send: (event: object) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: object) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true; // 客户端已断开连接
        }
      };
      // 心跳：模型首 token 可能要 1-2 分钟，期间每 15s 发一条 SSE 注释行保活，
      // 防止 Cloudflare 隧道等中间代理因连接空闲约 100s 掐断（手机端 Load failed 的根因）
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          closed = true;
        }
      }, 15_000);
      try {
        await body(send);
      } catch (e) {
        send({ type: "error", message: friendlyError(e) });
      } finally {
        clearInterval(heartbeat);
      }
      if (!closed) {
        try {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch {
          // 客户端已断开
        }
      }
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

export async function POST(req: Request) {
  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const feature = FEATURES[body.feature];
  if (!feature) {
    return NextResponse.json({ error: "未知功能" }, { status: 400 });
  }
  const messages = sanitizeMessages(body.messages);
  const userText = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

  // ---------- mock 模式（无 API Key） ----------
  if (isMockMode()) {
    const mock = getMockReply(body.feature, userText);
    return sseResponse(async (send) => {
      // 按小片段切片模拟流式（2-4 字符、间隔 15-30ms），与真实模式界面行为一致
      // 按码点切片，避免切断 emoji 等代理对
      const chars = [...mock.reply];
      for (let i = 0; i < chars.length; ) {
        const n = 2 + Math.floor(Math.random() * 3);
        send({ type: "delta", text: chars.slice(i, i + n).join("") });
        i += n;
        await new Promise((r) => setTimeout(r, 15 + Math.floor(Math.random() * 16)));
      }
      if (mock.hasPoster) send({ type: "rendering" });
      send({
        type: "done",
        posters: mock.hasPoster
          ? (mock.posters ?? []).map((p) => ({
              imageUrl: p.imageUrl,
              note: p.note ?? "（演示模式）真实模式将自动生成背景图并渲染文字",
            }))
          : [],
      });
    });
  }

  // ---------- 真实模式 ----------
  const model = getModel();
  if (!model) {
    return NextResponse.json(
      { error: "未配置 ARK_MODEL（见 .env）" },
      { status: 500 }
    );
  }

  return sseResponse(async (send) => {
    const systemPrompt = await buildSystemPrompt(feature);
    // 程序层热榜过滤：剔除政治/灾难/八卦类条目后再发给模型（防模型安全拒答）
    const sanitizedMessages = messages.map((m) =>
      m.role === "user" ? { ...m, content: sanitizeHotlistText(m.content) } : m
    );
    const reply = await callChat(
      model,
      [{ role: "system", content: systemPrompt }, ...sanitizedMessages],
      (delta) => send({ type: "delta", text: delta })
    );

    // 海报管线（可选，必须等完整文本——既定架构；一次回复可含多个数据包）
    let posters: PosterResult[] = [];
    if (hasPosterBlock(reply)) {
      const imageModel = getImageModel();
      if (!imageModel) {
        const count = parsePostersFromReply(reply).length || 1;
        posters = Array.from({ length: count }, () => ({
          imageUrl: null,
          note: "检测到海报数据包，但未配置 ARK_IMAGE_MODEL，跳过图片生成",
        }));
      } else {
        send({ type: "rendering" });
        posters = await generatePoster(reply, imageModel);
      }
    }

    send({ type: "done", posters });
  });
}
