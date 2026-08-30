/**
 * 消息气泡：用户（右绿）/ AI（左白）
 * AI 消息按块渲染：正文 markdown + 热点卡片 + 海报预览
 */

"use client";

import { useMemo } from "react";

import type { FeatureId } from "@/lib/skills";
import type { PosterResult } from "@/lib/poster";
import { splitBlocks } from "@/lib/blocks";
import Markdown from "./Markdown";
import HotspotCardView from "./HotspotCardView";
import PosterCard from "./PosterCard";

export interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** AI 消息附带：海报生成结果数组（由后端 done 事件返回，与数据包块一一对应） */
  posters?: PosterResult[];
  /** 系统提示类消息的备注（热榜快照的来源标签等） */
  note?: string;
  /** 是否是系统提示类消息（热榜快照等） */
  kind?: "hotlist" | "error";
  /** 流式输出进行中：用纯文本渲染，避免 markdown 抖动 */
  streaming?: boolean;
}

export default function MessageBubble({
  msg,
  feature,
}: {
  msg: ChatMsg;
  feature: FeatureId;
}) {
  const blocks = useMemo(
    () => (msg.role === "assistant" ? splitBlocks(msg.content, feature) : null),
    [msg.content, msg.role, feature]
  );

  // 用户消息
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[#3f6b3f] px-4 py-2.5 text-[14.5px] leading-relaxed text-white shadow-sm whitespace-pre-wrap">
          {msg.content}
        </div>
      </div>
    );
  }

  // AI 消息
  const isError = msg.kind === "error";
  const isHotlist = msg.kind === "hotlist";
  return (
    <div className="flex gap-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2f5230] text-[15px] text-white">
        安
      </div>
      <div className="min-w-0 max-w-[92%] flex-1">
        <div
          className={`rounded-2xl rounded-tl-sm border px-4 py-3 shadow-sm ${
            isError
              ? "border-[#f0d9c8] bg-[#fdf3ec]"
              : isHotlist
                ? "border-[#e0d7c6] bg-[#f4eee2]"
                : "border-[#e5dccb] bg-white"
          }`}
        >
          {isError ? (
            <p className="text-[14px] text-[#a05a1c]">😅 {msg.content}</p>
          ) : (
            <>
              {isHotlist ? (
                <div>
                  <p className="mb-1.5 text-[12px] font-semibold text-[#8a7a5e]">
                    📡 今日热榜（{msg.note ?? "自动抓取"}）
                  </p>
                  <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap text-[12.5px] leading-relaxed text-[#4a443a]">
                    {msg.content}
                  </pre>
                </div>
              ) : msg.streaming ? (
                // 流式进行中：纯文本渲染，避免 markdown 抖动（done 后走 splitBlocks 渲染链路）
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[#2f2a24]">
                  {msg.content}
                  <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-[#3f6b3f] align-text-bottom" />
                </p>
              ) : (
                <>
                  {blocks && blocks.rest ? <Markdown>{blocks.rest}</Markdown> : null}
                  {blocks?.cards && blocks.cards.length > 0 && (
                    <div className="mt-3 space-y-3">
                      {blocks.cards.map((c) => (
                        <HotspotCardView key={c.index} card={c} />
                      ))}
                    </div>
                  )}
                  {blocks?.posterBlocks.map((fields, i) => (
                    <PosterCard
                      key={i}
                      fields={fields}
                      imageUrl={msg.posters?.[i]?.imageUrl}
                      note={msg.posters?.[i]?.note}
                    />
                  ))}
                  {!blocks?.rest && !blocks?.cards && blocks?.posterBlocks.length === 0 ? (
                    <Markdown>{msg.content}</Markdown>
                  ) : null}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
