/**
 * Markdown 渲染封装（react-markdown + GFM）
 * 模型输出全部是 markdown 文本，用这个统一渲染（表格 / 任务列表 / 引用 / 标题等）。
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function Markdown({ children }: { children: string }) {
  return (
    <div className="md-body text-[15px] leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
