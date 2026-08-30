// 临时测试：poster.ts 三种格式兼容性（用完删除）
import {
  extractPosterBlocks,
  hasPosterBlock,
  parsePosterFields,
  parsePostersFromReply,
  parsePosterFromReply,
} from "./web/lib/poster.ts";

let failures = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`, extra ?? "");
  }
}

// (a) 旧格式A：逐行平铺（docs/测试记录/promo-materials.md 第1轮用例2）
const fmtA = `【海报数据包】

模板编号：T03（活动海报 · 礼盒）
主标题：高山云雾出好茶
副标题：安塘红营村二蹬岭 · 高山红茶礼盒
价格与规格：【待补充——产品卡暂无定价与规格信息，请向茶场/街道办确认后填入，不得编造】
卖点：
1. 群山环抱，常年云雾
2. 入口甘鲜，醇厚回甘
3. 传统工艺，送礼自饮皆宜
行动指令：微信搜"安塘礼伴"视频号，主页小店了解详情
背景图生成提示词："An elegant tea gift box scene on a rustic wooden table, misty green tea terraces visible through a soft-focus window in the background, warm morning light filtering through, no visible text on packaging or box. No text, no letters, no watermark in the image."

---
合规自查：
- [x] 无极限词（未用"最好/第一/顶级"）

AI 起草，请核对事实后再发布。`;

// (b) 旧格式B：markdown 列表（第3轮用例6，# 块头 + 联系方式）
const fmtB = `# 【海报数据包】

- **模板编号**：T01（产品展示）
- **主标题**：深山土蜂蜜
- **副标题**：安塘礼伴 · 山林放养自然采蜜
- **价格与规格**：鸭脚木冬蜜 80-100 元/斤，玻璃瓶装（具体瓶装规格及品牌统一售价请与蜂农/街道办确认后填入）
- **卖点**：
  1. 中华蜂山林放养
  2. 不喂白糖自然采蜜
  3. 油润丝滑带丝苦韵
- **行动指令**：微信私信订购，同城可自提
- **联系方式**：【待补充——请填入蜂农或安塘礼伴对接人微信/电话】
- **背景图生成提示词**：
  "A clear glass jar of rich golden honey sitting on a rough wooden surface, a wooden honey dipper resting beside it with thick honey slowly dripping, no visible text on any labels or packaging. No text, no letters, no watermark in the image."

---
**合规自查：**
- [x] 无极限词（未使用"天花板/最好/第一"等）

**AI 起草，请核对事实后再发布。**`;

// (c) 新变体：【海报数据包 1/2】带后缀块头 + 字段连排 + 一次两个包
const fmtC = `好的，给您做两张海报。

【海报数据包 1/2】
模板编号：T02（价格标签） 主标题：现摘金钻凤梨 副标题：村委统一定价·同城自提 价格与规格：50元/箱｜ 2- 3个装 卖点：
1. 山地种山泉灌
2. 不用泡盐水直接吃
行动指令：微信搜"安塘礼伴"视频号下单 背景图生成提示词："Fresh golden pineapples on a wooden table, orchard background, no text, no watermark."

【海报数据包 2/2】
模板编号：T01（产品展示） 主标题：深山土蜂蜜 副标题：山林放养自然采蜜 价格与规格：80-100元/斤 卖点：
1. 中华蜂山林放养
2. 不喂白糖自然采蜜
行动指令：微信私信订购 背景图生成提示词："A glass jar of golden honey, forest background, no text, no watermark."

---
合规自查：
- [x] 无极限词

AI 起草，请核对事实后再发布。`;

console.log("(a) 格式A 逐行平铺");
check("hasPosterBlock", hasPosterBlock(fmtA));
const a = parsePosterFromReply(fmtA);
check("解析成功", !!a);
check("templateId=T03", a?.templateId === "T03", a?.templateId);
check("title", a?.title === "高山云雾出好茶", a?.title);
check("subtitle", a?.subtitle === "安塘红营村二蹬岭 · 高山红茶礼盒", a?.subtitle);
check("price 含待补充", a?.price.includes("待补充"), a?.price);
check("points=3", a?.points.length === 3, a?.points);
check("points[0]", a?.points[0] === "群山环抱，常年云雾", a?.points[0]);
check("cta", a?.cta === '微信搜"安塘礼伴"视频号，主页小店了解详情', a?.cta);
check("bgPrompt 去引号", !!a && a.bgPrompt.startsWith("An elegant") && !a.bgPrompt.includes('"'), a?.bgPrompt.slice(0, 40));
check("hasMissing=true", a?.hasMissing === true);

console.log("(b) 格式B markdown 列表");
check("hasPosterBlock", hasPosterBlock(fmtB));
const b = parsePosterFromReply(fmtB);
check("解析成功", !!b);
check("templateId=T01", b?.templateId === "T01", b?.templateId);
check("title", b?.title === "深山土蜂蜜", b?.title);
check("price", b?.price.startsWith("鸭脚木冬蜜 80-100 元/斤"), b?.price);
check("price 不含残留 markdown", !!b && !/[*\-]$/.test(b.price), b?.price);
check("points=3", b?.points.length === 3, b?.points);
check("points[2]", b?.points[2] === "油润丝滑带丝苦韵", b?.points[2]);
check("cta", b?.cta === "微信私信订购，同城可自提", b?.cta);
check("contact 含待补充", b?.contact.includes("待补充"), b?.contact);
check("bgPrompt 多行合并", !!b && b.bgPrompt.startsWith("A clear glass jar") && b.bgPrompt.includes("watermark"), b?.bgPrompt.slice(0, 40));
check("hasMissing=true", b?.hasMissing === true);

console.log("(c) 新变体：带后缀块头 + 连排字段 + 两个包");
check("hasPosterBlock", hasPosterBlock(fmtC));
const blocks = extractPosterBlocks(fmtC);
check("提取到 2 个块", blocks.length === 2, blocks.length);
const list = parsePostersFromReply(fmtC);
check("解析出 2 条", list.length === 2, list.length);
const c1 = list[0];
check("包1 templateId=T02", c1?.templateId === "T02", c1?.templateId);
check("包1 title", c1?.title === "现摘金钻凤梨", c1?.title);
check("包1 subtitle", c1?.subtitle === "村委统一定价·同城自提", c1?.subtitle);
check("包1 price", c1?.price === "50元/箱｜ 2- 3个装", c1?.price);
check("包1 points=2", c1?.points.length === 2, c1?.points);
check("包1 points[1]", c1?.points[1] === "不用泡盐水直接吃", c1?.points[1]);
check("包1 cta", c1?.cta === '微信搜"安塘礼伴"视频号下单', c1?.cta);
check("包1 bgPrompt", c1?.bgPrompt.startsWith("Fresh golden"), c1?.bgPrompt.slice(0, 40));
check("包1 hasMissing=false", c1?.hasMissing === false);
const c2 = list[1];
check("包2 templateId=T01", c2?.templateId === "T01", c2?.templateId);
check("包2 title", c2?.title === "深山土蜂蜜", c2?.title);
check("包2 price", c2?.price === "80-100元/斤", c2?.price);
check("包2 points=2", c2?.points.length === 2, c2?.points);
check("包2 cta 不含合规内容", c2?.cta === "微信私信订购", c2?.cta);
check("parsePosterFromReply 取第一块", parsePosterFromReply(fmtC)?.templateId === "T02");
check("parsePosterFields 单块兼容", parsePosterFields(blocks[1])?.templateId === "T01");

console.log(failures === 0 ? "\n全部通过" : `\n${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
