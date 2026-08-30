/**
 * 海报气泡：物料工坊的模型回复含【海报数据包】时，
 * 解析字段展示（含【待补充】高亮），有图片 URL 时显示成品海报 + 下载按钮。
 */

import { useState, type ReactNode } from "react";

import type { PosterFields } from "@/lib/poster";

const TEMPLATE_NAMES: Record<string, string> = {
  T01: "产品展示",
  T02: "价格标签",
  T03: "活动海报",
};

export default function PosterCard({
  fields,
  imageUrl,
  note,
}: {
  fields: PosterFields;
  imageUrl?: string | null;
  note?: string | null;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-[#e0d7c6] bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#efe9df] bg-[#faf7f2] px-3.5 py-2">
        <span className="text-[13px] font-bold text-[#2f2a24]">
          🖼️ 海报预览 · {fields.templateId}
          {TEMPLATE_NAMES[fields.templateId] ? `（${TEMPLATE_NAMES[fields.templateId]}）` : ""}
        </span>
      </div>

      <div className="p-3.5">
        {imageUrl && !imgFailed ? (
          <div className="mx-auto max-w-[280px]">
            <img
              src={imageUrl}
              alt="海报成品"
              className="w-full rounded-lg border border-[#e0d7c6]"
              onError={() => setImgFailed(true)}
            />
            <a
              href={imageUrl}
              download
              className="mt-2.5 block w-full rounded-lg bg-[#3f6b3f] py-2 text-center text-[13px] font-semibold text-white hover:bg-[#2f5230]"
            >
              ⬇️ 下载海报
            </a>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-[#d8d0c4] bg-[#faf7f2] px-3 py-3 text-[13px] text-[#6b6256]">
            {note ? (
              <p className="mb-1.5 text-[12px] text-[#b5762c]">{note}</p>
            ) : null}
            <p>
              程序将按模板 <b>{fields.templateId}</b> 渲染：
            </p>
          </div>
        )}

        {/* 字段明细 */}
        <div className="mt-3 space-y-1.5 text-[13px]">
          <Field label="主标题" value={fields.title} />
          <Field label="副标题" value={fields.subtitle} />
          <Field label="价格与规格" value={fields.price} />
          {fields.points.length > 0 && (
            <div className="flex gap-2">
              <span className="shrink-0 text-[12px] font-semibold text-[#8a7a5e]">
                卖点
              </span>
              <ul className="space-y-0.5">
                {fields.points.map((p, i) => (
                  <li key={i}>
                    {i + 1}. {highlightMissing(p)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Field label="行动指令" value={fields.cta} />
          {fields.contact && <Field label="联系方式" value={fields.contact} />}
        </div>

        {fields.hasMissing && (
          <p className="mt-3 rounded-lg bg-[#fdeee0] px-3 py-2 text-[12px] text-[#a05a1c]">
            ⚠️ 部分字段为【待补充】，请与街道办 / 农户确认后人工填入，不得编造。
          </p>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-[12px] font-semibold text-[#8a7a5e]">
        {label}
      </span>
      <span className="min-w-0 flex-1">{highlightMissing(value)}</span>
    </div>
  );
}

/** 把【待补充/待核实】占位高亮 */
function highlightMissing(text: string): ReactNode {
  const parts = text.split(/(【[^】]*(?:待补充|待核实|待确认)[^】]*】)/g);
  return parts.map((part, i) =>
    /【[^】]*(?:待补充|待核实|待确认)[^】]*】/.test(part) ? (
      <mark
        key={i}
        className="rounded bg-[#fdeee0] px-1 text-[#a05a1c]"
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}
