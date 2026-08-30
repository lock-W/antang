# -*- coding: utf-8 -*-
# 临时测试：render_poster.parse_poster_fields 三种格式兼容性（用完删除）
import io
import sys

sys.path.insert(0, "scripts")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

from render_poster import parse_poster_fields, _extract_poster_blocks

failures = []

def check(label, cond, extra=None):
    if cond:
        print(f"  PASS {label}")
    else:
        failures.append(label)
        print(f"  FAIL {label} {extra if extra is not None else ''}")

fmtA = """【海报数据包】

模板编号：T03（活动海报 · 礼盒）
主标题：高山云雾出好茶
副标题：安塘红营村二蹬岭 · 高山红茶礼盒
价格与规格：【待补充——产品卡暂无定价与规格信息，请向茶场/街道办确认后填入，不得编造】
卖点：
1. 群山环抱，常年云雾
2. 入口甘鲜，醇厚回甘
3. 传统工艺，送礼自饮皆宜
行动指令：微信搜"安塘礼伴"视频号，主页小店了解详情
背景图生成提示词："An elegant tea gift box scene on a rustic wooden table, no visible text on packaging. No text, no letters, no watermark in the image."

---
合规自查：
- [x] 无极限词

AI 起草，请核对事实后再发布。"""

fmtB = """# 【海报数据包】

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
  "A clear glass jar of rich golden honey, warm dappled sunlight, no visible text. No text, no letters, no watermark in the image."

---
**合规自查：**
- [x] 无极限词

**AI 起草，请核对事实后再发布。**"""

fmtC = """好的，给您做两张海报。

【海报数据包 1/2】
模板编号：T02（价格标签） 主标题：现摘金钻凤梨 副标题：村委统一定价·同城自提 价格与规格：50元/箱｜ 2- 3个装 卖点：
1. 山地种山泉灌
2. 不用泡盐水直接吃
行动指令：微信搜"安塘礼伴"视频号下单 背景图生成提示词："Fresh golden pineapples on a wooden table, no text, no watermark."

【海报数据包 2/2】
模板编号：T01（产品展示） 主标题：深山土蜂蜜 副标题：山林放养自然采蜜 价格与规格：80-100元/斤 卖点：
1. 中华蜂山林放养
2. 不喂白糖自然采蜜
行动指令：微信私信订购 背景图生成提示词："A glass jar of golden honey, forest background, no text, no watermark."

---
合规自查：
- [x] 无极限词

AI 起草，请核对事实后再发布。"""

print("(a) 格式A 逐行平铺")
a = parse_poster_fields(fmtA)
check("解析成功", a is not None)
check("模板编号=T03", a and a["模板编号"] == "T03", a and a["模板编号"])
check("主标题", a and a["主标题"] == "高山云雾出好茶", a and a["主标题"])
check("副标题", a and a["副标题"] == "安塘红营村二蹬岭 · 高山红茶礼盒", a and a["副标题"])
check("价格含待补充", a and "待补充" in a["价格与规格"], a and a["价格与规格"])
check("卖点=3", a and a["卖点"] == ["群山环抱，常年云雾", "入口甘鲜，醇厚回甘", "传统工艺，送礼自饮皆宜"], a and a["卖点"])
check("行动指令", a and a["行动指令"] == '微信搜"安塘礼伴"视频号，主页小店了解详情', a and a["行动指令"])

print("(b) 格式B markdown 列表")
b = parse_poster_fields(fmtB)
check("解析成功", b is not None)
check("模板编号=T01", b and b["模板编号"] == "T01", b and b["模板编号"])
check("主标题", b and b["主标题"] == "深山土蜂蜜", b and b["主标题"])
check("价格无 markdown 残留", b and b["价格与规格"].startswith("鸭脚木冬蜜 80-100 元/斤") and not b["价格与规格"].endswith(("*", "-")), b and b["价格与规格"])
check("卖点=3", b and len(b["卖点"]) == 3 and b["卖点"][2] == "油润丝滑带丝苦韵", b and b["卖点"])
check("行动指令", b and b["行动指令"] == "微信私信订购，同城可自提", b and b["行动指令"])

print("(c) 新变体：带后缀块头 + 连排字段 + 两个包")
blocks = _extract_poster_blocks(fmtC)
check("提取到 2 个块", len(blocks) == 2, len(blocks))
c1 = parse_poster_fields(fmtC)
check("整块解析取第一包 T02", c1 and c1["模板编号"] == "T02", c1 and c1["模板编号"])
check("包1 主标题", c1 and c1["主标题"] == "现摘金钻凤梨", c1 and c1["主标题"])
check("包1 副标题", c1 and c1["副标题"] == "村委统一定价·同城自提", c1 and c1["副标题"])
check("包1 价格", c1 and c1["价格与规格"] == "50元/箱｜ 2- 3个装", c1 and c1["价格与规格"])
check("包1 卖点=2", c1 and c1["卖点"] == ["山地种山泉灌", "不用泡盐水直接吃"], c1 and c1["卖点"])
check("包1 行动指令", c1 and c1["行动指令"] == '微信搜"安塘礼伴"视频号下单', c1 and c1["行动指令"])
c2 = parse_poster_fields(blocks[1])
check("包2 单块解析 T01", c2 and c2["模板编号"] == "T01", c2 and c2["模板编号"])
check("包2 主标题", c2 and c2["主标题"] == "深山土蜂蜜", c2 and c2["主标题"])
check("包2 价格", c2 and c2["价格与规格"] == "80-100元/斤", c2 and c2["价格与规格"])
check("包2 行动指令不带合规内容", c2 and c2["行动指令"] == "微信私信订购", c2 and c2["行动指令"])

print("\n全部通过" if not failures else f"\n{len(failures)} 项失败")
sys.exit(0 if not failures else 1)
