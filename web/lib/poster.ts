/**
 * 海报数据包解析器
 *
 * 物料工坊的模型输出里出现「【海报数据包】」块时，由程序解析字段，
 * 再走「Seedream 生成背景图 → render_poster.py 渲染文字」管线（决策 D-04）。
 *
 * ⚠️ 兼容三种真实输出格式（见 docs/测试记录/promo-materials.md）：
 *   格式 1（第 1 轮）：`字段名：值` 逐行平铺
 *   格式 2（第 2/3 轮）：`- **字段名**：值` markdown 列表，块头可能是
 *   `【海报数据包】` 或 `# 【海报数据包】`，且可能多出「联系方式」字段；
 *   格式 3（连排变体）：块头可带后缀（如 `【海报数据包 1/2】`），
 *   多个字段挤在同一段落里，且一次回复可含多个数据包。
 * 字段提取不依赖逐行——按已知字段名切分：找到「字段名 + 冒号（中/英文）」的位置，
 * 其值延伸到下一个已知字段名出现处或块尾，连排/逐行/markdown 加粗三种写法都能解。
 * 字段缺失时返回空字符串，由调用方决定展示策略。
 */

export interface PosterFields {
  templateId: string; // T01 / T02 / T03
  title: string; // 主标题
  subtitle: string; // 副标题
  price: string; // 价格与规格
  points: string[]; // 卖点（1-3 条）
  cta: string; // 行动指令
  contact: string; // 联系方式（部分输出才有）
  bgPrompt: string; // 背景图生成提示词（英文）
  /** 是否有【待补充 / 待核实】占位（UI 必须高亮提示人工补填） */
  hasMissing: boolean;
}

/** 单张海报的生成结果（后端管线产出，经 done 事件传给前端） */
export interface PosterResult {
  imageUrl: string | null;
  note: string | null;
}

const FIELD_NAMES = [
  "模板编号",
  "主标题",
  "副标题",
  "价格与规格",
  "卖点",
  "行动指令",
  "联系方式",
  "背景图生成提示词",
] as const;

const MISSING_PATTERN = /【\s*(?:待补充|待核实|待确认)[^】]*】/;

/** 块头：`【海报数据包】`，可带 `# ` 前缀和 ` 1/2` 之类后缀 */
const BLOCK_HEADER_RE = /^#?\s*【海报数据包[^】]*】/gm;

/** 字段标记：字段名（允许前导 `-` `*` 空白、可带括号备注）+ 中/英文冒号 */
const FIELD_MARKER_RE = new RegExp(
  `(?:^|[\\s*\\-])(${FIELD_NAMES.join("|")})(?:[（(][^)）]*[)）])?\\*{0,2}\\s*[：:]`,
  "gm"
);

/** 从整段回复中提取所有海报数据包块（含块头到结束分隔符），按出现顺序排列 */
export function extractPosterBlocks(text: string): string[] {
  const headers = [...text.matchAll(BLOCK_HEADER_RE)];
  const blocks: string[] = [];
  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].index!;
    // 块到下一个数据包开头或文末结束
    const limit = i + 1 < headers.length ? headers[i + 1].index! : text.length;
    let block = text.slice(start, limit);
    // 数据包到「---」或「合规自查」或「AI 起草」等分隔处结束
    const end = block.search(/\n\s*(?:---|合规|AI\s*起草|程序渲染)/);
    if (end !== -1) block = block.slice(0, end);
    block = block.trim();
    if (block) blocks.push(block);
  }
  return blocks;
}

/** 兼容导出：取第一个海报数据包块 */
export function extractPosterBlock(text: string): string | null {
  return extractPosterBlocks(text)[0] ?? null;
}

/** 是否包含海报数据包（块头允许带后缀，如【海报数据包 1/2】） */
export function hasPosterBlock(text: string): boolean {
  return /【海报数据包[^】]*】/.test(text);
}

/** 在块内定位所有已知字段的标记位置 */
function findFieldMarkers(block: string) {
  const markers: { name: string; nameStart: number; valueStart: number }[] = [];
  for (const m of block.matchAll(FIELD_MARKER_RE)) {
    const name = m[1];
    markers.push({
      name,
      nameStart: m.index! + m[0].indexOf(name),
      valueStart: m.index! + m[0].length,
    });
  }
  return markers;
}

/** 字段值清洗：折叠空白（含换行），去掉首尾的 `*`/`-`/空格（markdown 残留） */
function cleanValue(seg: string): string {
  return seg.replace(/\s+/g, " ").replace(/^[\s*\-]+|[\s*\-]+$/g, "");
}

/** 解析海报数据包块为结构化字段 */
export function parsePosterFields(block: string): PosterFields | null {
  const markers = findFieldMarkers(block);
  const fields: Record<string, string> = {};
  let points: string[] = [];

  for (let i = 0; i < markers.length; i++) {
    const { name, valueStart } = markers[i];
    const segEnd = i + 1 < markers.length ? markers[i + 1].nameStart : block.length;
    const seg = block.slice(valueStart, segEnd);
    if (name === "卖点") {
      // 卖点取后续编号列表行（`1. xxx` / `1、xxx`，允许前导空白和 `*`）
      points = [...seg.matchAll(/^[ \t]*\*{0,2}[ \t]*\d+[.、][ \t]*(.+)$/gm)].map(
        (m) => m[1].replace(/[\s*]+$/, "").replace(/^[\s*]+/, "")
      );
    } else {
      fields[name] = cleanValue(seg);
    }
  }

  const templateId = (fields["模板编号"] || "").match(/T0\d/)?.[0] || "";
  if (!templateId) return null; // 没有模板编号就不算有效数据包

  const valueOf = (name: string) => fields[name] || "";
  const bgPrompt = valueOf("背景图生成提示词").replace(/^"|"$/g, "").trim();
  const joinValues = ["主标题", "副标题", "价格与规格", "行动指令", "联系方式"]
    .map(valueOf)
    .concat(points.join(" "))
    .concat(bgPrompt);

  return {
    templateId,
    title: valueOf("主标题"),
    subtitle: valueOf("副标题"),
    price: valueOf("价格与规格"),
    points,
    cta: valueOf("行动指令"),
    contact: valueOf("联系方式"),
    bgPrompt,
    hasMissing: joinValues.some((v) => MISSING_PATTERN.test(v)),
  };
}

/** 从整段回复解析所有海报数据包（解析不出模板编号的块被跳过） */
export function parsePostersFromReply(reply: string): PosterFields[] {
  return extractPosterBlocks(reply)
    .map((b) => parsePosterFields(b))
    .filter((f): f is PosterFields => f !== null);
}

/** 兼容导出：从整段回复直接拿第一块的结构化字段 */
export function parsePosterFromReply(reply: string): PosterFields | null {
  return parsePostersFromReply(reply)[0] ?? null;
}
