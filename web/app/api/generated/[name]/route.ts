/**
 * GET /api/generated/[name]
 *
 * 提供运行时生成的海报图片。
 * 生产模式下 public/ 目录在构建时定型，构建后写入 public/generated/ 的文件会 404，
 * 所以生成的海报通过这个动态路由从磁盘读出返回。
 * 文件名严格白名单校验，防路径穿越。
 */

import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const SAFE_NAME = /^[a-zA-Z0-9_-]+\.(png|jpg|jpeg)$/;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  if (!SAFE_NAME.test(name)) {
    return NextResponse.json({ error: "无效文件名" }, { status: 400 });
  }
  const filePath = path.join(process.cwd(), "public", "generated", name);
  try {
    const buf = await fs.readFile(filePath);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": name.endsWith(".png") ? "image/png" : "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }
}
