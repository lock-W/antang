# -*- coding: utf-8 -*-
"""
海报文字渲染（决策 D-04 的程序侧）
==================================
AI（Seedream）只生成不含文字的背景图；本模块把数据包字段（主标题/副标题/
价格/卖点/行动指令）渲染到背景图上，输出可直接发布的成品海报。
价格电话等关键文字由程序渲染，保证 100% 准确。

用法（模块）：from render_poster import render_poster, parse_poster_fields
用法（测试）：由 test_skill.py 在检测到【海报数据包】时自动调用。
阶段 3 做网站时，服务端直接复用本模块，前端在对话里返回成品图 URL。

版式：按数据包"模板编号"选择 T01/T02/T03（未知编号回落 T01）。
字体：优先环境变量 POSTER_FONT / POSTER_FONT_BOLD，否则依次尝试
Windows 微软雅黑、Linux 常见 Noto Sans CJK / 文泉驿路径。
"""
from __future__ import annotations
import os
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# 中文字体候选路径（按优先级）：Windows 微软雅黑 → Linux Noto Sans CJK → 文泉驿
_FONT_CANDIDATES_REGULAR = [
    "C:/Windows/Fonts/msyh.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
]
_FONT_CANDIDATES_BOLD = [
    "C:/Windows/Fonts/msyhbd.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
]


def _resolve_font(env_var: str, candidates: list[str]) -> str:
    """解析字体路径：环境变量优先，其次候选列表，都找不到则抛带说明的异常。"""
    env_val = os.environ.get(env_var, "").strip()
    if env_val:
        if Path(env_val).exists():
            return env_val
        raise RuntimeError(f"环境变量 {env_var} 指向的字体文件不存在：{env_val}")
    for path in candidates:
        if Path(path).exists():
            return path
    raise RuntimeError(
        f"找不到中文字体，请设置 {env_var} 环境变量指向一个中文字体文件（.ttf/.ttc）"
    )


FONT_REGULAR = _resolve_font("POSTER_FONT", _FONT_CANDIDATES_REGULAR)
FONT_BOLD = _resolve_font("POSTER_FONT_BOLD", _FONT_CANDIDATES_BOLD)


# 已知字段名集合（与 web/lib/poster.ts 保持一致）
_FIELD_NAMES = [
    "模板编号", "主标题", "副标题", "价格与规格",
    "卖点", "行动指令", "联系方式", "背景图生成提示词",
]

# 块头：【海报数据包】，可带 "# " 前缀和 " 1/2" 之类后缀
_BLOCK_HEADER_RE = re.compile(r"(?m)^#?\s*【海报数据包[^】]*】")

# 字段标记：字段名（允许前导 - * 空白、可带括号备注）+ 中/英文冒号
_FIELD_MARKER_RE = re.compile(
    r"(?:^|[\s*\-])(%s)(?:[（(][^)）]*[)）])?\*{0,2}\s*[：:]" % "|".join(_FIELD_NAMES),
    re.M,
)


def _extract_poster_blocks(answer: str) -> list[str]:
    """提取所有海报数据包块：块头到下一个数据包开头、或 ---/合规/AI 起草/程序渲染
    分隔处、或文末结束。"""
    headers = list(_BLOCK_HEADER_RE.finditer(answer))
    blocks = []
    for i, h in enumerate(headers):
        limit = headers[i + 1].start() if i + 1 < len(headers) else len(answer)
        block = answer[h.start():limit]
        m = re.search(r"\n\s*(?:---|合规|AI\s*起草|程序渲染)", block)
        if m:
            block = block[:m.start()]
        block = block.strip()
        if block:
            blocks.append(block)
    return blocks


def _clean_value(seg: str) -> str:
    """字段值清洗：折叠空白（含换行），去掉首尾的 */-/空格（markdown 残留）。"""
    return re.sub(r"^[\s*\-]+|[\s*\-]+$", "", re.sub(r"\s+", " ", seg))


def parse_poster_fields(answer: str) -> dict | None:
    """从模型的【海报数据包】输出中解析各字段。解析不到模板编号则返回 None。

    字段提取不依赖逐行——按已知字段名切分：找到「字段名 + 冒号」的位置，
    其值延伸到下一个已知字段名出现处或块尾，连排/逐行/markdown 加粗三种写法都兼容
    （与 web/lib/poster.ts 的 parsePosterFields 行为一致）。
    多块回复时取第一个有效数据包（web 服务端逐块调用本函数）。"""
    for block in _extract_poster_blocks(answer) or [answer]:
        fields = _parse_block_fields(block)
        if fields:
            return fields
    return None


def _parse_block_fields(block: str) -> dict | None:
    markers = [(m.start(1), m.end(), m.group(1)) for m in _FIELD_MARKER_RE.finditer(block)]
    fields: dict = {}
    points: list[str] = []
    for i, (name_start, value_start, name) in enumerate(markers):
        seg_end = markers[i + 1][0] if i + 1 < len(markers) else len(block)
        seg = block[value_start:seg_end]
        if name == "卖点":
            # 卖点取后续编号列表行（1. xxx / 1、xxx，允许前导空白和 *）
            points = [
                re.sub(r"[\s*]+$", "", re.sub(r"^[\s*]+", "", m))
                for m in re.findall(r"(?m)^[ \t]*\*{0,2}[ \t]*\d+[.、][ \t]*(.+)$", seg)
            ]
        else:
            fields[name] = _clean_value(seg)

    tpl = re.search(r"T0\d", fields.get("模板编号", ""))
    if not tpl:
        return None
    if not points:
        print("[警告] 海报数据包中未解析到卖点列表，成品海报将不含卖点行", file=sys.stderr)

    return {
        "模板编号": tpl.group(0),
        "主标题": fields.get("主标题", ""),
        "副标题": fields.get("副标题", ""),
        "价格与规格": fields.get("价格与规格", ""),
        "卖点": points[:3],
        "行动指令": fields.get("行动指令", ""),
    }


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REGULAR, size)


def _center(draw: ImageDraw.ImageDraw, y: int, text: str, font, fill, W: int):
    bbox = draw.textbbox((0, 0), text, font=font)
    draw.text(((W - (bbox[2] - bbox[0])) / 2, y), text, font=font, fill=fill)


def _fit_font(text: str, start_size: int, bold: bool, max_width: int,
              draw: ImageDraw.ImageDraw) -> ImageFont.FreeTypeFont:
    """字号自动收缩：文字超出 max_width 时逐级缩小，直到放得下（下限约为起始的 40%）。"""
    size = start_size
    while size > start_size * 0.4:
        font = _font(size, bold)
        bbox = draw.textbbox((0, 0), text, font=font)
        if bbox[2] - bbox[0] <= max_width:
            return font
        size -= 2
    return _font(int(start_size * 0.4), bold)


def _clean_price(raw: str) -> str:
    """清洗价格字段：括号里的"请确认后填入"类备注是给用户看的提示，不上海报；
    待补充/待核实/清洗后为空 → "价格规格即将公布"（待核实内容不上海报，留人工闸门）。"""
    price = re.split(r"[（(][^）)]*(?:确认|填入|核实|待补)", raw)[0].strip("，, ")
    if "待补充" in price or "待核实" in price or not price:
        return "价格规格即将公布"
    return price


def _render_t01(d: ImageDraw.ImageDraw, fields: dict, price: str, W: int, H: int, u: int):
    """T01 产品展示：顶部压暗带放主/副标题 + 底部信息带放卖点/价格/行动指令。"""
    # 顶部压暗带：保证标题在任何背景上可读
    d.rectangle([0, 0, W, int(H * 0.26)], fill=(0, 0, 0, 80))
    _center(d, int(H * 0.06), fields["主标题"],
            _fit_font(fields["主标题"], u * 9, True, int(W * 0.92), d), (255, 255, 255), W)
    if fields["副标题"]:
        _center(d, int(H * 0.155), fields["副标题"],
                _fit_font(fields["副标题"], u * 4, False, int(W * 0.92), d), (235, 235, 235), W)

    # 底部信息带：卖点 + 价格 + 行动指令
    band_top = int(H * 0.66)
    d.rectangle([0, band_top, W, H], fill=(0, 0, 0, 110))
    y = band_top + int(H * 0.035)
    for p in fields["卖点"]:
        _center(d, y, f"· {p} ·", _fit_font(f"· {p} ·", u * 4, False, int(W * 0.92), d), (255, 255, 255), W)
        y += int(H * 0.052)
    if price:
        _center(d, y + int(H * 0.01), price,
                _fit_font(price, u * 6, True, int(W * 0.92), d), (255, 214, 102), W)
        y += int(H * 0.095)
    if fields["行动指令"]:
        _center(d, y + int(H * 0.01), fields["行动指令"],
                _fit_font(fields["行动指令"], u * 4, False, int(W * 0.92), d), (230, 230, 230), W)


def _render_t02(d: ImageDraw.ImageDraw, fields: dict, price: str, W: int, H: int, u: int):
    """T02 价格标签：画面上部居中大标题（轻压暗）+ 中下部卖点列表 + 底部价格/行动指令条。"""
    # 上部轻压暗 + 居中大标题
    d.rectangle([0, 0, W, int(H * 0.20)], fill=(0, 0, 0, 40))
    _center(d, int(H * 0.06), fields["主标题"],
            _fit_font(fields["主标题"], u * 11, True, int(W * 0.92), d), (255, 255, 255), W)
    if fields["副标题"]:
        _center(d, int(H * 0.145), fields["副标题"],
                _fit_font(fields["副标题"], u * 4, False, int(W * 0.92), d), (240, 240, 240), W)

    # 中下部卖点列表
    y = int(H * 0.50)
    for p in fields["卖点"]:
        _center(d, y, f"· {p} ·", _fit_font(f"· {p} ·", u * 5, False, int(W * 0.92), d), (255, 255, 255), W)
        y += int(H * 0.06)

    # 底部价格/行动指令条
    band_top = int(H * 0.80)
    d.rectangle([0, band_top, W, H], fill=(0, 0, 0, 130))
    y = band_top + int(H * 0.03)
    if price:
        _center(d, y, price,
                _fit_font(price, u * 7, True, int(W * 0.92), d), (255, 214, 102), W)
        y += int(H * 0.10)
    if fields["行动指令"]:
        _center(d, y, fields["行动指令"],
                _fit_font(fields["行动指令"], u * 4, False, int(W * 0.92), d), (230, 230, 230), W)


def _render_t03(d: ImageDraw.ImageDraw, fields: dict, price: str, W: int, H: int, u: int):
    """T03 活动海报：左侧约 45% 半透明深色文字栏（标题/卖点/价格纵向排列），
    右侧留出背景图主体。"""
    panel_w = int(W * 0.45)
    d.rectangle([0, 0, panel_w, H], fill=(0, 0, 0, 130))
    margin = int(panel_w * 0.10)
    max_w = panel_w - margin * 2

    y = int(H * 0.08)
    d.text((margin, y), fields["主标题"],
           font=_fit_font(fields["主标题"], u * 6, True, max_w, d), fill=(255, 255, 255))
    y += int(H * 0.10)
    if fields["副标题"]:
        d.text((margin, y), fields["副标题"],
               font=_fit_font(fields["副标题"], u * 3, False, max_w, d), fill=(235, 235, 235))
        y += int(H * 0.06)
    y += int(H * 0.04)
    for p in fields["卖点"]:
        d.text((margin, y), f"· {p}",
               font=_fit_font(f"· {p}", u * 3, False, max_w, d), fill=(255, 255, 255))
        y += int(H * 0.055)
    if price:
        y += int(H * 0.03)
        d.text((margin, y), price,
               font=_fit_font(price, u * 4, True, max_w, d), fill=(255, 214, 102))
        y += int(H * 0.08)
    if fields["行动指令"]:
        y += int(H * 0.03)
        d.text((margin, y), fields["行动指令"],
               font=_fit_font(fields["行动指令"], u * 3, False, max_w, d), fill=(230, 230, 230))


_TEMPLATES = {"T01": _render_t01, "T02": _render_t02, "T03": _render_t03}


def render_poster(fields: dict, bg_path: Path, out_path: Path) -> Path:
    """把数据包字段渲染到背景图上，输出成品海报。版式按模板编号选择，未知编号回落 T01。"""
    img = Image.open(bg_path).convert("RGB")
    W, H = img.size
    d = ImageDraw.Draw(img, "RGBA")
    u = W // 100  # 相对单位，适配不同分辨率

    price = _clean_price(fields["价格与规格"]) if fields["价格与规格"] else ""

    tpl = fields.get("模板编号", "T01")
    layout = _TEMPLATES.get(tpl)
    if layout is None:
        print(f"[警告] 未知模板编号 {tpl}，已回落 T01 版式", file=sys.stderr)
        layout = _render_t01
    layout(d, fields, price, W, H, u)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, "PNG")
    return out_path
