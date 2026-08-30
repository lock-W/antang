# -*- coding: utf-8 -*-
"""
热榜抓取脚本（程序层，落地决策 D-03）
======================================
DailyHotApi → 本地缓存 → outputs/hotlist_today.txt → 喂给 hotspot-radar skill。

【三种部署方案，改 .env 里的 HOTLIST_API_BASE 即可切换】
方案一（推荐，稳定）：本地 Docker 自建 DailyHotApi（开源 MIT，github.com/imsyy/DailyHotApi）
    docker run --restart always -p 6688:6688 -d imsyy/dailyhot-api:latest
    .env 写：HOTLIST_API_BASE=http://localhost:6688
方案二（零部署，公共实例，稳定性无保障）：
    .env 写：HOTLIST_API_BASE=https://api-hot.imsyy.top
    （公共实例可能失效或限流，失效时换成其他公共部署地址即可，脚本不用改）
方案三（零部署兜底，默认）：不配置 HOTLIST_API_BASE 时，直连各平台公开接口抓取。
    注意：官方公共实例 api-hot.imsyy.top 域名已失效（2026-08 实测 DNS 无记录）；
    微博/抖音的接口需要登录 cookie 抓不了，直连模式实际抓百度/头条/B站三个平台，
    对"找乡土选题"的用途已够用；要全平台请用方案一。

运行：python scripts/fetch_hotlist.py [--refresh 强制重抓]
"""
from __future__ import annotations  # Python 3.8 下让 list[str] 等注解可用

import argparse
import json
import os
import sys
import urllib.request
from datetime import datetime
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent

# 只抓目标用户真正在用的 5 个平台（DailyHotApi 路由名 → 中文名）
PLATFORMS = {
    "douyin": "抖音",
    "weibo": "微博",
    "baidu": "百度",
    "toutiao": "头条",
    "bilibili": "B站",
}
TOP_N = 15  # 每平台取前 15 条


def load_env() -> None:
    """读取 .env 里的配置（不依赖第三方库）。"""
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


def fetch_platform(base: str, route: str) -> list[str]:
    """抓单个平台热榜，返回标题列表。失败抛异常由调用方处理。"""
    url = f"{base.rstrip('/')}/{route}"
    req = urllib.request.Request(url, headers={"User-Agent": "antang-ai/1.0"})
    data = json.load(urllib.request.urlopen(req, timeout=15))
    items = data.get("data") or []
    if not items:
        raise ValueError(f"返回无数据（code={data.get('code')}）")
    titles = []
    for it in items[:TOP_N]:
        t = (it.get("title") or it.get("name") or "").strip()
        if t:
            titles.append(t)
    if not titles:
        raise ValueError("条目里没有标题字段")
    return titles


# ---------- 方案三：直连各平台公开接口（不依赖 DailyHotApi） ----------

_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"


def _get_json(url: str, referer: str = "") -> dict:
    headers = {"User-Agent": _UA}
    if referer:
        headers["Referer"] = referer
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.load(resp)


def fetch_baidu_direct() -> list[str]:
    """百度热搜公开接口（cards 的 content 是双层嵌套，递归收集带 word 的条目）。"""
    data = _get_json("https://top.baidu.com/api/board?platform=wise&tab=realtime")
    titles = []

    def walk(node) -> None:
        if isinstance(node, dict):
            w = (node.get("word") or "").strip()
            if w:
                titles.append(w)
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(data.get("data"))
    if not titles:
        raise ValueError("百度接口返回无数据")
    return titles[:TOP_N]


def fetch_toutiao_direct() -> list[str]:
    """头条热榜公开接口。"""
    data = _get_json(
        "https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc",
        referer="https://www.toutiao.com/",
    )
    titles = [(it.get("Title") or "").strip() for it in data.get("data") or []]
    titles = [t for t in titles if t]
    if not titles:
        raise ValueError("头条接口返回无数据")
    return titles[:TOP_N]


def fetch_bilibili_direct() -> list[str]:
    """B站热门公开接口。"""
    data = _get_json(
        "https://api.bilibili.com/x/web-interface/popular?ps=30&pn=1",
        referer="https://www.bilibili.com/",
    )
    titles = [(it.get("title") or "").strip() for it in (data.get("data") or {}).get("list") or []]
    titles = [t for t in titles if t]
    if not titles:
        raise ValueError(f"B站接口返回无数据（code={data.get('code')}）")
    return titles[:TOP_N]


# 直连模式可用的平台（微博/抖音需登录 cookie，无法直连）
DIRECT_FETCHERS = {
    "baidu": fetch_baidu_direct,
    "toutiao": fetch_toutiao_direct,
    "bilibili": fetch_bilibili_direct,
}


def main() -> None:
    parser = argparse.ArgumentParser(description="抓取当日热榜，输出纯文本标题列表")
    parser.add_argument("--refresh", action="store_true", help="无视今日缓存强制重抓")
    args = parser.parse_args()

    load_env()
    base = os.environ.get("HOTLIST_API_BASE", "").strip()
    direct_mode = not base
    if direct_mode:
        print("[模式] 未配置 HOTLIST_API_BASE，直连各平台公开接口（百度/头条/B站）")

    # 缓存：outputs/cache/hotlist_YYYYMMDD.json，同一天重复运行直接读缓存
    # （对应 D-03"缓存后做筛选"——调试 skill 时热榜固定，测试结果才可对比）
    today = datetime.now().strftime("%Y%m%d")
    cache_file = ROOT / "outputs" / "cache" / f"hotlist_{today}.json"

    results = None
    if cache_file.exists() and not args.refresh:
        # 缓存缺 data 键或结构损坏时当作无缓存，降级重新抓取
        try:
            cached = json.loads(cache_file.read_text(encoding="utf-8"))
            results = cached["data"]
            if not isinstance(results, dict) or not results:
                raise ValueError("缓存结构异常")
            print(f"[缓存] 使用今日缓存（抓取于 {cached['fetched_at']}）")
        except (ValueError, KeyError, TypeError, OSError) as e:
            results = None
            print(f"[警告] 缓存文件损坏（{e}），当作无缓存重新抓取")

    if results is None:
        results, failures = {}, []
        for route, name in PLATFORMS.items():
            try:
                if direct_mode:
                    fetcher = DIRECT_FETCHERS.get(route)
                    if fetcher is None:
                        raise ValueError("该平台需登录 cookie，直连模式不支持")
                    titles = fetcher()
                else:
                    titles = fetch_platform(base, route)
                results[route] = titles
                print(f"[抓取] {name}（{route}）成功，{len(titles)} 条")
            except Exception as e:
                failures.append(name)
                print(f"[警告] {name}（{route}）抓取失败，已跳过：{e}")

        if not results:
            sys.exit(
                "[错误] 全部平台抓取失败。\n"
                "降级方案：手动打开各平台热榜，把标题逐行粘贴成 txt 喂给 skill——\n"
                "hotspot-radar 对手动粘贴的热榜同样有效（见 SKILL.md 输入说明）。"
            )

        cache_file.parent.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(json.dumps({
            "fetched_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "api_base": base,
            "data": results,
        }, ensure_ascii=False, indent=1), encoding="utf-8")
        if failures:
            print(f"[提示] {len(failures)} 个平台失败（{'、'.join(failures)}），不影响其余平台")

    # 输出干净的纯文本：每行一条 "[平台] 话题标题"，不带链接、不带热度
    out_path = ROOT / "outputs" / "hotlist_today.txt"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    lines = []
    total = 0
    for route, titles in results.items():
        name = PLATFORMS.get(route, route)
        for t in titles:
            lines.append(f"[{name}] {t}")
            total += 1
    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"已获取 {len(results)} 个平台共 {total} 条热榜，存至 outputs/hotlist_today.txt")


if __name__ == "__main__":
    main()
