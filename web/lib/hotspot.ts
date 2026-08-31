/**
 * 热点雷达 · 选题推荐卡片解析器（容错版）
 *
 * 模型输出格式不稳定（LLM 固有问题，2026-08-30 实测），本解析器兼容多种写法：
 *
 * 卡片头：
 *   `### 卡片 1 ｜ 时令日历`（严格） / `卡片 1 ｜ 时令日历` / `卡片1：时令日历` / `**卡片 2** 全网热点`
 *
 * 字段（话题名称/结合角度/适配产品/推荐形式/一句话理由/下一步）：
 *   A. `- **话题名称**：值`（markdown 列表，严格格式）
 *   B. `话题名称：值`（同行冒号）
 *   C. `话题名称：\n值`（冒号后换行，值在下一行）
 *   D. `话题名称\n值`（字段名独占一行无冒号，值在下一行——实测出现的松散格式）
 *
 * 适配产品兜底：卡片头后、第一个字段前的裸行（如 `红营茶（中秋礼盒组合装）`）在适配产品
 * 字段缺失时作为适配产品。
 *
 * 全部解析失败返回 null，前端回退到普通 markdown 渲染。
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

/** 已知字段名（独占行检测用） */
const FIELD_LABELS = [
  "话题名称",
  "结合角度",
  "适配产品",
  "推荐形式",
  "一句话理由",
  "下一步",
] as const;

/** 卡片头：容忍 `###`/`**` 前缀与 `｜|:：、.` 分隔符 */
const CARD_HEADER_RE = /^#{0,3}\s*\*{0,2}\s*卡片\s*(\d+)\s*[｜|:：、.]?\s*([^\n]*)/gm;

export function parseHotspotCards(reply: string): HotspotCard[] | null {
  const matches: { index: number; type: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = CARD_HEADER_RE.exec(reply)) !== null) {
    matches.push({
      index: Number(m[1]),
      type: m[2].replace(/[*#\s]/g, "").trim() || "选题推荐",
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

/** 提取字段值：形式 A/B（冒号同行）/C（冒号换行）/D（字段名独占行无冒号） */
function grabField(body: string, label: string): string {
  // A/B/C：`标签*[：:]` 后同行或下一行的值
  const re = new RegExp(`\\*{0,2}${label}\\*{0,2}\\s*[：:]\\s*(?:\\n\\s*)?([^\\n]+)`);
  const m = body.match(re);
  if (m) return m[1].replace(/^\*+\s*|\s*\*+$/g, "").trim();

  // D：字段名独占一行（无冒号），值取后续行直到下一个字段名
  const lines = body.split("\n");
  const idx = lines.findIndex((l) => l.trim() === label);
  if (idx !== -1 && idx + 1 < lines.length) {
    const nextField = lines
      .slice(idx + 1)
      .findIndex((l) => (FIELD_LABELS as readonly string[]).includes(l.trim()));
    const end = nextField === -1 ? lines.length : idx + 1 + nextField;
    const value = lines
      .slice(idx + 1, end)
      .map((l) => l.trim())
      .filter(Boolean)
      .join(" ");
    if (value) return value;
  }
  return "";
}

/** 适配产品兜底：卡片头后、第一个字段前的裸行（如 `红营茶（中秋礼盒组合装）`） */
function grabLeadingProduct(body: string): string {
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const firstFieldIdx = lines.findIndex((l) =>
    (FIELD_LABELS as readonly string[]).includes(l)
  );
  if (firstFieldIdx > 0) {
    const candidate = lines[firstFieldIdx - 1];
    if (candidate && !/^卡片/i.test(candidate)) return candidate;
  }
  return "";
}

function parseCardBody(index: number, type: string, body: string): HotspotCard | null {
  const topic = grabField(body, "话题名称");
  let product = grabField(body, "适配产品");
  if (!product) product = grabLeadingProduct(body);
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
