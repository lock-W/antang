/**
 * 热点雷达 · 选题推荐卡片解析器
 *
 * 模型输出固定 3 张卡片（markdown）：`### 卡片 N ｜ 类型` + `- **字段**：值`
 * 解析为结构化卡片供前端以卡片样式渲染（交接文档：建议用卡片样式而不是纯文字）。
 * 解析失败返回 null，前端回退到普通 markdown 渲染。
 */

export interface HotspotCard {
  index: number;
  /** 卡片类型：时令日历 / 全网热点 · 直接相关 / 全网热点 · 可借力 */
  type: string;
  topic: string; // 话题名称
  angle: string; // 结合角度
  product: string; // 适配产品
  form: string; // 推荐形式
  reason: string; // 一句话理由
  next: string; // 下一步
}

export function parseHotspotCards(reply: string): HotspotCard[] | null {
  const re = /###\s*卡片\s*(\d+)\s*｜\s*([^\n]+)/g;
  const matches: { index: number; type: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(reply)) !== null) {
    matches.push({
      index: Number(m[1]),
      type: m[2].trim(),
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  if (matches.length === 0) return null;

  const cards: HotspotCard[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].end;
    const end = i + 1 < matches.length ? matches[i + 1].start : reply.length;
    const body = reply.slice(start, end);
    const card = parseCardBody(matches[i].index, matches[i].type, body);
    if (card) cards.push(card);
  }
  return cards.length > 0 ? cards : null;
}

function grabField(body: string, label: string): string {
  // 兼容 `- **标签**：值` 与 `**标签**：值`
  const re = new RegExp(`\\*{0,2}${label}\\*{0,2}\\s*[：:]\\s*([^\\n]+)`);
  const m = body.match(re);
  return m ? m[1].trim() : "";
}

function parseCardBody(index: number, type: string, body: string): HotspotCard | null {
  const topic = grabField(body, "话题名称");
  const product = grabField(body, "适配产品");
  if (!topic && !product) return null; // 结构不符合，放弃结构化
  return {
    index,
    type,
    topic: topic || "（未提供）",
    angle: grabField(body, "结合角度"),
    product,
    form: grabField(body, "推荐形式"),
    reason: grabField(body, "一句话理由"),
    next: grabField(body, "下一步"),
  };
}
