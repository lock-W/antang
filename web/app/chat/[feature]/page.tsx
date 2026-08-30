/**
 * 功能聊天页（动态路由：/chat/[feature]）
 * feature ∈ rural-scriptwriter | live-coach | hotspot-radar | promo-materials
 */

import Link from "next/link";
import { notFound } from "next/navigation";

import { FEATURES, type FeatureId } from "@/lib/skills";
import ChatWindow from "@/components/ChatWindow";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ feature: string }>;
}) {
  const { feature } = await params;
  const config = FEATURES[feature as FeatureId];
  if (!config) notFound();

  return (
    <div className="flex h-[calc(100vh-56px-34px)] min-h-0 flex-col">
      {/* 功能标题栏 */}
      <div className="flex items-center gap-3 border-b border-[#e5dccb] bg-white/70 px-4 py-2.5 backdrop-blur sm:px-6">
        <Link
          href="/"
          className="rounded-lg px-2 py-1 text-[12.5px] text-[#8a7a5e] transition hover:bg-[#efe9df] hover:text-[#2f5230]"
        >
          ← 首页
        </Link>
        <span className="text-lg">{config.icon}</span>
        <div>
          <h1 className="text-[15px] font-bold leading-tight text-[#2f2a24]">
            {config.name}
          </h1>
          <p className="hidden text-[12px] leading-tight text-[#8a7a5e] sm:block">
            {config.tagline}
          </p>
        </div>
      </div>

      {/* 聊天主体 */}
      <div className="min-h-0 flex-1">
        <ChatWindow feature={config} />
      </div>
    </div>
  );
}
