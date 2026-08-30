/**
 * 首页：4 个功能入口
 */

import Link from "next/link";

import { FEATURE_LIST } from "@/lib/skills";

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      {/* Hero */}
      <div className="mb-10 text-center">
        <h1 className="text-2xl font-bold text-[#2f2a24] sm:text-3xl">
          安塘智宣 <span className="text-[#b5762c]">·</span> 说人话就能用的 AI 宣传助手
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-[14px] leading-relaxed text-[#6b6256]">
          不会写文案、不会剪视频、不懂广告法？没关系。
          用大白话告诉它你想宣传什么，它帮你写脚本、出文案、做海报、查违禁词。
          面向安塘街道农户和村干部，六大本地农产品：金钻凤梨 · 红营茶 · 丝苗米 · 松岗粉 · 土蜂蜜 · 夏威夷果。
        </p>
      </div>

      {/* 功能入口 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FEATURE_LIST.map((f) => (
          <Link
            key={f.id}
            href={`/chat/${f.id}`}
            className="group rounded-2xl border border-[#e0d7c6] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#3f6b3f] hover:shadow-md"
          >
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#f0f5ee] text-2xl">
                {f.icon}
              </span>
              <div>
                <h2 className="text-[16px] font-bold text-[#2f2a24] group-hover:text-[#2f5230]">
                  {f.name}
                </h2>
                <p className="mt-1 text-[13px] leading-relaxed text-[#8a7a5e]">
                  {f.tagline}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <p className="mt-8 text-center text-[12px] text-[#b0a693]">
        演示环境：未配置 API Key 时使用内置示例数据，界面与真实运行一致
      </p>
    </div>
  );
}
