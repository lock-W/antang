/**
 * 合规提示条（合规红线：所有 AI 生成内容，页面必须有固定提示）
 */

export default function ComplianceNotice({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5 border-t border-[#e5dccb] bg-[#f4eee2] px-3 py-1.5 text-[12px] text-[#8a7a5e]">
      <span aria-hidden>⚠️</span>
      <span>{text} · 请人工核对后再发布</span>
    </div>
  );
}
