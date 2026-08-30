/**
 * 热点雷达 · 选题推荐卡片
 * 模型输出的 3 张卡片按结构化字段渲染（交接文档：卡片样式，字段固定）
 */

import type { HotspotCard } from "@/lib/hotspot";

const TYPE_STYLE: Record<string, string> = {
  时令日历: "bg-[#e8f0e4] text-[#3f6b3f]",
  "全网热点 · 直接相关": "bg-[#fdeee0] text-[#b5762c]",
  "全网热点 · 可借力": "bg-[#e9eef7] text-[#4a6da7]",
};

function typeStyle(type: string): string {
  for (const key of Object.keys(TYPE_STYLE)) {
    if (type.includes(key)) return TYPE_STYLE[key];
  }
  return "bg-[#efe9df] text-[#6b6256]";
}

export default function HotspotCardView({ card }: { card: HotspotCard }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#e0d7c6] bg-white shadow-sm">
      {/* 卡片头 */}
      <div className="flex items-center justify-between gap-2 border-b border-[#efe9df] bg-[#faf7f2] px-3.5 py-2">
        <span className="text-[13px] font-bold text-[#2f2a24]">
          卡片 {card.index} ｜ {card.type}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${typeStyle(card.type)}`}
        >
          {card.product || "待定"}
        </span>
      </div>

      <div className="space-y-2.5 px-3.5 py-3 text-[13.5px]">
        <Row label="话题名称" value={card.topic} strong />
        <Row label="结合角度" value={card.angle} />
        <Row label="推荐形式" value={card.form} />
        <Row label="一句话理由" value={card.reason} />
        <Row label="下一步" value={card.next} />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  if (!value || value === "（未提供）") return null;
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-[12px] font-semibold text-[#8a7a5e]">
        {label}
      </span>
      <span className={`min-w-0 flex-1 ${strong ? "font-semibold" : ""}`}>
        {value}
      </span>
    </div>
  );
}
