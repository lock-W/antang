import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";
import { FEATURE_LIST } from "@/lib/skills";
import ComplianceNotice from "@/components/ComplianceNotice";

export const metadata: Metadata = {
  title: "安塘智宣 · AI 宣传助手",
  description:
    "帮广东云浮安塘街道的农户和村干部做宣传的 AI 网站：短视频脚本、朋友圈文案、海报、直播话术、热点选题。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      {/* suppressHydrationWarning：联想 AI 翻译等浏览器插件会向 body 注入属性，属外部因素，忽略其导致的水合告警 */}
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        {/* 品牌栏 */}
        <header className="border-b border-[#e5dccb] bg-[#faf7f2]/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#3f6b3f] text-[16px] text-white">
                安
              </span>
              <span className="text-[17px] font-bold tracking-wide text-[#2f2a24]">
                安塘智宣
              </span>
              <span className="hidden text-[12px] text-[#8a7a5e] sm:inline">
                帮农户做宣传的 AI 助手
              </span>
            </Link>
            <nav className="hidden items-center gap-1 md:flex">
              {FEATURE_LIST.map((f) => (
                <Link
                  key={f.id}
                  href={`/chat/${f.id}`}
                  className="rounded-lg px-3 py-1.5 text-[13.5px] font-medium text-[#4a443a] transition hover:bg-[#efe9df] hover:text-[#2f5230]"
                >
                  {f.icon} {f.name}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        {/* 页面主体 */}
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>

        {/* 合规提示（固定展示，红线要求） */}
        <ComplianceNotice text="AI 生成内容请人工核对后发布" />
      </body>
    </html>
  );
}
