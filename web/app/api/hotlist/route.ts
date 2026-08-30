/**
 * POST /api/hotlist
 *
 * 热点雷达页「刷新今日热榜」按钮调用：
 * - 总是跑 scripts/fetch_hotlist.py --refresh，返回 outputs/hotlist_today.txt 内容
 *   （配置了 HOTLIST_API_BASE 走 DailyHotApi；未配置时脚本自动直连百度/头条/B站公开接口）
 * - 脚本失败（全平台抓取失败等）：降级返回演示热榜文本
 *
 * 返回：{ content: string, mock: boolean, note?: string }
 */

import { execFile } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";

import { NextResponse } from "next/server";

import { PROJECT_ROOT } from "@/lib/server/ark";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";
export const maxDuration = 60;

/** 演示热榜（模拟 fetch_hotlist.py 输出格式），仅在抓取失败时兜底 */
const MOCK_HOTLIST = [
  "[抖音] 乡村生活记录视频走红网络",
  "[微博] 某明星官宣离婚",
  "[百度] 全国多地高温破纪录",
  "[百度] 二十四节气之处暑科普",
  "[头条] 广东早稻丰收开镰",
  "[头条] 某地洪水致多人受灾",
  "[抖音] 今年七夕礼物消费趋势报告发布",
  "[微博] 年轻人开始流行回村过周末",
  "[B站] 100元挑战在村里生活一天",
  "[抖音] 网红农产品直播带货翻车现场",
].join("\n");

export async function POST() {
  try {
    await execFileAsync(
      process.env.PYTHON || "python",
      ["scripts/fetch_hotlist.py", "--refresh"],
      { cwd: PROJECT_ROOT, timeout: 60_000 }
    );
    const content = await fs.readFile(
      path.join(PROJECT_ROOT, "outputs", "hotlist_today.txt"),
      "utf-8"
    );
    return NextResponse.json({ content, mock: false });
  } catch (e) {
    console.error("[hotlist]", String(e).slice(0, 300));
    // 抓取失败降级：手动粘贴热榜的说明 + 演示数据
    return NextResponse.json({
      content: MOCK_HOTLIST,
      mock: true,
      note: "热榜抓取失败（网络异常），当前为演示数据",
    });
  }
}
