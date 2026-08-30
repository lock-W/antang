/**
 * 聊天窗口（4 个功能页共用）
 * - 状态：消息列表 + 加载态 + 输入
 * - 后端为 SSE 流式接口（/api/chat）：delta 逐字上屏，done 带海报结果
 * - 热点雷达：刷新今日热榜按钮（后端抓热榜 → 作为用户消息入对话 → 自动提问）
 * - 物料工坊：开场引导菜单（决策 D-07，UI 承接）
 * - 加载/错误兜底：明确"正在生成…"提示，API 失败给人话
 */

"use client";

import { useEffect, useRef, useState } from "react";

import type { FeatureConfig } from "@/lib/skills";
import { MATERIAL_GUIDE } from "@/lib/skills";
import type { PosterResult } from "@/lib/poster";
import MessageBubble, { type ChatMsg } from "./MessageBubble";

const EXAMPLES: Record<string, string[]> = {
  "rural-scriptwriter": [
    "帮我写凤梨的宣传视频脚本",
    "帮我写蜂蜜的短视频脚本，能挂链接",
    "帮我宣传一下安塘礼伴这个品牌",
  ],
  "hotspot-radar": ["今天拍什么？", "最近有什么热点能蹭？", "帮我看看这个热点能不能蹭"],
  "promo-materials": [
    "帮我写个朋友圈文案，宣传金钻凤梨",
    "帮我做一张海报",
    "帮我检查这段文案有没有违禁词",
  ],
  "live-coach": [
    "我下周直播卖凤梨，帮我弄个直播稿",
    "直播时有人说我是骗子怎么办",
    "陪我练直播",
  ],
};

/** 后端 SSE 事件（见 app/api/chat/route.ts） */
interface ChatEvent {
  type?: "delta" | "rendering" | "done" | "error";
  text?: string;
  message?: string;
  posters?: PosterResult[];
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(36).slice(2);
}

export default function ChatWindow({ feature }: { feature: FeatureConfig }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [renderingPoster, setRenderingPoster] = useState(false);
  const [hotlistLoading, setHotlistLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isHotspot = feature.id === "hotspot-radar";
  const isMaterials = feature.id === "promo-materials";
  const busy = loading || hotlistLoading;

  // 自动滚动到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading, hotlistLoading]);

  /** 调 /api/chat（SSE 流式），把回复逐步写入一条 assistant 消息 */
  async function callChat(history: { role: "user" | "assistant"; content: string }[]) {
    setLoading(true);
    setStreaming(false);
    setRenderingPoster(false);
    const assistantId = newId();
    let text = "";

    // 追加或更新本次的 assistant 消息（纯函数，可重复调用）
    const updateAssistant = (patch?: Partial<ChatMsg>) => {
      setMessages((prev) => {
        if (!prev.some((m) => m.id === assistantId)) {
          return [
            ...prev,
            { id: assistantId, role: "assistant" as const, content: text, streaming: true, ...patch },
          ];
        }
        return prev.map((m) => (m.id === assistantId ? { ...m, content: text, ...patch } : m));
      });
    };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature: feature.id, messages: history }),
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "请求失败");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const evt of events) {
          const line = evt.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          let obj: ChatEvent;
          try {
            obj = JSON.parse(payload) as ChatEvent;
          } catch {
            continue;
          }
          if (obj.type === "delta" && obj.text) {
            text += obj.text;
            setStreaming(true);
            updateAssistant();
          } else if (obj.type === "rendering") {
            // 文本流结束，后端正在渲染海报（还要十几秒）
            setStreaming(false);
            setRenderingPoster(true);
            updateAssistant({ streaming: false });
          } else if (obj.type === "done") {
            setStreaming(false);
            setRenderingPoster(false);
            updateAssistant({
              streaming: false,
              posters: obj.posters ?? [],
            });
          } else if (obj.type === "error") {
            throw new Error(obj.message || "服务开小差了，请稍后重试");
          }
        }
      }
    } catch (e) {
      // 已有部分流式内容则先定稿，再补错误气泡
      if (text) updateAssistant({ streaming: false });
      const errText = e instanceof Error ? e.message : "服务开小差了，请稍后重试";
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "assistant", content: errText, kind: "error" },
      ]);
    } finally {
      setLoading(false);
      setStreaming(false);
      setRenderingPoster(false);
    }
  }

  /** 发送一条用户消息 */
  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    const history = [...messages, { id: "", role: "user" as const, content: trimmed }]
      .filter((m) => m.kind !== "hotlist" && m.kind !== "error") // 快照/错误消息不发给模型
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    setMessages((prev) => [
      ...prev,
      { id: newId(), role: "user", content: trimmed },
    ]);
    await callChat(history);
  }

  /** 热点雷达：刷新今日热榜（热榜作为用户消息入对话，自动提问） */
  async function refreshHotlist() {
    if (busy) return;
    setHotlistLoading(true);
    try {
      const res = await fetch("/api/hotlist", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error("热榜获取失败");
      const hotlistText = (data.content || "").trim();
      if (!hotlistText) {
        // 空热榜防护：不自动发起对话，提示手动粘贴
        setMessages((prev) => [
          ...prev,
          {
            id: newId(),
            role: "assistant",
            content: "热榜为空，请手动粘贴热榜内容",
            kind: "error",
          },
        ]);
        return;
      }
      // 热榜快照气泡（仅展示，不发给模型）
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          content: hotlistText,
          kind: "hotlist",
          note: data.mock ? "演示数据" : "已抓取",
        },
      ]);
      // 自动提问：热榜作为用户消息发进对话（同样走流式逻辑）
      const question = `今天拍什么？这是今天的热榜：\n${hotlistText}`;
      const history = [...messages, { id: "", role: "user" as const, content: question }]
        .filter((m) => m.kind !== "hotlist" && m.kind !== "error")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "user", content: question },
      ]);
      await callChat(history);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          content: "热榜获取失败，请稍后重试",
          kind: "error",
        },
      ]);
    } finally {
      setHotlistLoading(false);
    }
  }

  const showWelcome = messages.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 消息区 */}
      <div ref={scrollRef} className="chat-scroll min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6">
        {showWelcome ? (
          <div className="mx-auto mt-6 max-w-xl space-y-5 text-center">
            <div className="text-4xl">{feature.icon}</div>
            <div>
              <h2 className="text-lg font-bold text-[#2f2a24]">{feature.name}</h2>
              <p className="mt-1 text-[13.5px] text-[#8a7a5e]">{feature.tagline}</p>
            </div>

            {isMaterials && (
              <div className="rounded-2xl border border-[#e0d7c6] bg-white p-4 text-left shadow-sm">
                <p className="mb-2.5 text-[13.5px] font-semibold text-[#2f2a24]">
                  {MATERIAL_GUIDE.title}
                </p>
                <div className="space-y-2">
                  {MATERIAL_GUIDE.options.map((o) => (
                    <button
                      key={o.key}
                      onClick={() => send(o.key)}
                      disabled={busy}
                      className="flex w-full items-center gap-3 rounded-xl border border-[#e5dccb] bg-[#faf7f2] px-3.5 py-2.5 text-left transition hover:border-[#3f6b3f] hover:bg-[#f0f5ee] disabled:opacity-50"
                    >
                      <span className="text-lg">{["✍️", "🖼️", "🔍"][Number(o.key) - 1]}</span>
                      <span>
                        <span className="block text-[14px] font-semibold text-[#2f2a24]">
                          {o.key}. {o.label}
                        </span>
                        <span className="block text-[12px] text-[#8a7a5e]">{o.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-[#e5dccb] bg-[#f4eee2] p-3.5 text-left">
              <p className="mb-2 text-[12px] font-semibold text-[#8a7a5e]">
                试试这样说：
              </p>
              <div className="flex flex-wrap gap-2">
                {(EXAMPLES[feature.id] || []).map((ex) => (
                  <button
                    key={ex}
                    onClick={() => send(ex)}
                    disabled={busy}
                    className="rounded-full border border-[#d8d0c4] bg-white px-3 py-1.5 text-[12.5px] text-[#4a443a] transition hover:border-[#3f6b3f] hover:text-[#3f6b3f] disabled:opacity-50"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {messages.map((m) => (
              <MessageBubble key={m.id} msg={m} feature={feature.id} />
            ))}
            {loading && !streaming && (
              <div className="flex gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2f5230] text-[15px] text-white">
                  安
                </div>
                <div className="rounded-2xl rounded-tl-sm border border-[#e5dccb] bg-white px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="flex gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#3f6b3f]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#3f6b3f] [animation-delay:0.15s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#3f6b3f] [animation-delay:0.3s]" />
                    </span>
                    <span className="text-[13px] text-[#8a7a5e]">
                      {renderingPoster
                        ? "文案已完成，正在渲染海报（还需十几秒）…"
                        : feature.id === "promo-materials"
                          ? "正在生成，请稍候（首句约需 1-2 分钟；若做海报会再花十几秒渲染）…"
                          : "正在生成，请稍候（首句约需 1-2 分钟）…"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="border-t border-[#e5dccb] bg-[#faf7f2] px-3 py-3 sm:px-6">
        <div className="mx-auto max-w-3xl">
          {isHotspot && (
            <button
              onClick={refreshHotlist}
              disabled={busy}
              className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[#3f6b3f] bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-[#3f6b3f] transition hover:bg-[#f0f5ee] disabled:opacity-50"
            >
              <span className={hotlistLoading ? "animate-spin" : ""}>⟳</span>
              {hotlistLoading ? "抓取中…" : "刷新今日热榜"}
            </button>
          )}
          <div className="flex items-end gap-2 rounded-2xl border border-[#d8d0c4] bg-white p-2 shadow-sm focus-within:border-[#3f6b3f]">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder={feature.placeholder}
              disabled={busy}
              className="max-h-32 min-h-[38px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[14.5px] outline-none placeholder:text-[#b0a693] disabled:opacity-60"
            />
            <button
              onClick={() => send(input)}
              disabled={busy || !input.trim()}
              className="h-9 shrink-0 rounded-xl bg-[#3f6b3f] px-4 text-[13.5px] font-semibold text-white transition hover:bg-[#2f5230] disabled:opacity-40"
            >
              {loading ? "生成中" : "发送"}
            </button>
          </div>
          <p className="mt-1.5 text-center text-[11px] text-[#b0a693]">
            {feature.complianceNotice} · Enter 发送 / Shift+Enter 换行
          </p>
        </div>
      </div>
    </div>
  );
}
