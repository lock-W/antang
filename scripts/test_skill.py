# -*- coding: utf-8 -*-
"""
Skill 测试脚本
==============
用途：把指定的 SKILL.md + 知识库文件拼成 system prompt，调用火山方舟（豆包）模型，
     逐条运行测试用例，结果按 skill 分文件追加保存到 docs/测试记录/<skill名>.md。

用法：
  # 只跑第一条用例（验证链路是否通）
  python scripts/test_skill.py --first

  # 跑全部用例
  python scripts/test_skill.py --all

  # 换 skill / 知识库 / 模型
  python scripts/test_skill.py --all --skill skills/live-coach/SKILL.md ^
      --kb knowledge/01_安塘礼伴品牌介绍（补全版）.md knowledge/广告法违禁词.md ^
      --model doubao-seed-1-6-250615
"""
from __future__ import annotations
import argparse
import base64
import os
import re
import sys
from datetime import datetime
from pathlib import Path

# Windows 终端默认 GBK 编码，强制 UTF-8 防止中文乱码
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

# 项目根目录（本脚本在 scripts/ 下，根目录是它的上一级）
ROOT = Path(__file__).resolve().parent.parent


def load_env(env_path: Path) -> None:
    """读取 .env 文件，把 KEY=VALUE 写入环境变量（不依赖第三方库）。"""
    if not env_path.exists():
        sys.exit(
            f"[错误] 找不到 {env_path}\n"
            "请在项目根目录创建 .env 文件，内容为一行：\n"
            "  ARK_API_KEY=你的密钥\n"
            "（可选）再写一行指定模型：\n"
            "  ARK_MODEL=你的模型ID或接入点ID"
        )
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


def read_file(path: Path, label: str) -> str:
    """读取文本文件，失败时给出友好报错。"""
    if not path.exists():
        sys.exit(f"[错误] 找不到{label}：{path}")
    return path.read_text(encoding="utf-8")


def build_system_prompt(skill_path: Path, kb_paths: list[Path]) -> str:
    """把 SKILL.md 和知识库文件拼成一个 system prompt。"""
    parts = [read_file(skill_path, "SKILL.md")]
    for kb in kb_paths:
        parts.append(
            f"\n\n===== 知识库文件：{kb.name} =====\n\n"
            + read_file(kb, f"知识库文件 {kb}")
        )
    return "".join(parts)


def load_cases(cases_path: Path) -> list[str]:
    """读取测试用例：每条一行，空行和 # 开头的行会被忽略。"""
    lines = read_file(cases_path, "测试用例文件").splitlines()
    return [l.strip() for l in lines if l.strip() and not l.strip().startswith("#")]


def call_model(client, model: str, system_prompt: str, user_input: str) -> str:
    """调用豆包模型，返回文本回答。"""
    resp = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_input},
        ],
    )
    return resp.choices[0].message.content


def extract_bg_prompt(answer: str) -> str | None:
    """从海报数据包输出中提取"背景图生成提示词"字段的英文提示词。"""
    m = re.search(r"背景图生成提示词[*]*[：:]\s*(.+)", answer, re.DOTALL)
    if not m:
        return None
    text = m.group(1).strip()
    # 先截到合规自查等后续分隔符之前，避免后文引号污染提示词
    text = re.split(r"\n\s*(?:---|合规|AI 起草)", text)[0]
    # 提示词通常包在英文双引号里；取第一个 " 到最后一个 " 之间的内容
    if '"' in text:
        text = text[text.index('"') + 1:text.rindex('"')]
    text = text.strip().strip('"').strip()
    return text or None


def generate_bg_image(client, image_model: str, prompt: str, case_no: int) -> tuple[Path | None, str]:
    """调用火山方舟 images.generate 生成海报背景图，保存到 outputs/poster_bg/。
    返回 (文件路径或 None, 记录备注)。任何失败都不抛异常——不中断其余用例。"""
    out_dir = ROOT / "outputs" / "poster_bg"
    out_dir.mkdir(parents=True, exist_ok=True)
    fname = f"case{case_no}_{datetime.now():%Y%m%d_%H%M%S}.png"
    fpath = out_dir / fname
    try:
        resp = client.images.generate(model=image_model, prompt=prompt,
                                      response_format="b64_json", watermark=False,
                                      size="1728x2304")  # 竖版 3:4
    except Exception:
        try:  # 部分模型/接入点不认额外参数，退化为最小参数重试
            resp = client.images.generate(model=image_model, prompt=prompt)
        except Exception as e:
            return None, f"背景图生成失败：{e}"
    try:
        datum = resp.data[0]
        b64 = getattr(datum, "b64_json", None)
        if b64:
            fpath.write_bytes(base64.b64decode(b64))
        else:
            import urllib.request
            urllib.request.urlretrieve(datum.url, fpath)
        return fpath, f"背景图已生成：{fpath}"
    except Exception as e:
        return None, f"背景图保存失败：{e}"


def next_round_number(out_path: Path) -> int:
    """取记录文件里已有的最大「## 第N轮」编号 +1；无匹配（旧格式记录）则从 1 开始。"""
    if not out_path.exists():
        return 1
    rounds = re.findall(r"^## 第(\d+)轮", out_path.read_text(encoding="utf-8"), re.MULTILINE)
    return max(int(n) for n in rounds) + 1 if rounds else 1


def append_record(out_path: Path, header: str, results: list[tuple[str, str]]) -> None:
    """把本轮输入+输出追加写入记录文件（不存在则新建）。"""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if not out_path.exists():
        out_path.write_text(f"# {out_path.stem} · 测试记录\n", encoding="utf-8")
    with out_path.open("a", encoding="utf-8") as f:
        f.write(f"\n\n{header}\n")
        for i, (q, a) in enumerate(results, 1):
            f.write(f"\n### 用例 {i}\n\n**输入**：{q}\n\n**输出**：\n\n{a}\n")
    print(f"[完成] 结果已追加到 {out_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Skill 测试脚本（火山方舟/豆包）")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--first", action="store_true", help="只跑第一条用例（默认）")
    mode.add_argument("--all", action="store_true", help="跑全部用例")
    parser.add_argument("--skill", default="skills/rural-scriptwriter/SKILL.md",
                        help="SKILL.md 路径（默认：乡土编剧）")
    parser.add_argument("--kb", nargs="*", default=[
        "knowledge/01_安塘礼伴品牌介绍（补全版）.md",
        "knowledge/广告法违禁词.md",
    ], help="知识库文件路径，可传多个")
    parser.add_argument("--cases", default="scripts/test_cases.md", help="测试用例文件")
    parser.add_argument("--out", default=None,
                        help="结果记录文件（默认自动取 docs/测试记录/<skill文件夹名>.md）")
    parser.add_argument("--model", default=os.environ.get("ARK_MODEL", ""),
                        help="模型ID/接入点ID（也可用 .env 里的 ARK_MODEL）")
    args = parser.parse_args()

    # 1. 读取 .env
    load_env(ROOT / ".env")
    api_key = os.environ.get("ARK_API_KEY", "").strip()
    if not api_key:
        sys.exit("[错误] .env 里没找到 ARK_API_KEY，请填入你的火山方舟密钥。")

    # 2. 确定模型
    model = args.model or os.environ.get("ARK_MODEL", "").strip()
    if not model:
        sys.exit(
            "[错误] 未指定模型。请在 .env 里加一行：\n"
            "  ARK_MODEL=你的模型ID或接入点ID（形如 ep-xxxx 或 doubao-xxx）\n"
            "也可以用命令行参数 --model 指定。"
        )

    # 3. 拼接 system prompt + 读取用例
    skill_path = ROOT / args.skill
    kb_paths = [ROOT / p for p in args.kb]
    system_prompt = build_system_prompt(skill_path, kb_paths)
    cases = load_cases(ROOT / args.cases)
    if not cases:
        sys.exit(f"[错误] {args.cases} 里没有任何测试用例（每条一行）。")

    run_all = args.all
    todo = cases if run_all else cases[:1]
    print(f"[信息] skill   : {args.skill}")
    print(f"[信息] 知识库  : {len(kb_paths)} 个文件 -> {[p.name for p in kb_paths]}")
    print(f"[信息] 模型    : {model}")
    print(f"[信息] 用例    : 共 {len(cases)} 条，本次运行 {len(todo)} 条"
          f"（{'全部' if run_all else '仅第一条，用 --all 跑全部'}）")

    # 4. 调用模型
    try:
        from volcenginesdkarkruntime import Ark
    except ImportError:
        sys.exit("[错误] 未安装火山方舟 SDK，请先运行：pip install \"volcengine-python-sdk[ark]\"")
    client = Ark(api_key=api_key, base_url="https://ark.cn-beijing.volces.com/api/v3")

    results = []
    image_model = os.environ.get("ARK_IMAGE_MODEL", "").strip()
    for i, case in enumerate(todo, 1):
        print(f"\n[运行中] 用例 {i}/{len(todo)}：{case[:40]}{'...' if len(case) > 40 else ''}")
        try:
            answer = call_model(client, model, system_prompt, case)
        except Exception as e:
            sys.exit(f"[错误] 调用模型失败：{e}\n"
                     "常见原因：Key 不对 / 模型ID不对 / 该模型未开通。")
        print(f"[完成] 用例 {i}，输出 {len(answer)} 字")

        # 海报数据包管线：检测到数据包则自动提取提示词并生成背景图
        if "【海报数据包】" in answer:
            prompt = extract_bg_prompt(answer)
            if not prompt:
                answer += "\n\n> ⚠️ 背景图生成提示词提取失败（字段格式不符合预期）。"
                print("[警告] 提示词提取失败")
            elif not image_model:
                answer += "\n\n> ⚠️ 未配置 ARK_IMAGE_MODEL，跳过背景图生成。"
                print("[警告] 未配置 ARK_IMAGE_MODEL，跳过生图")
            else:
                print("[生图中] 检测到海报数据包，正在生成背景图...")
                fpath, note = generate_bg_image(client, image_model, prompt, i)
                answer += f"\n\n> {note}"
                print(f"[{('完成' if fpath else '警告')}] {note}")
                # 背景图生成成功 → 程序渲染文字，输出成品海报
                if fpath:
                    try:
                        sys.path.insert(0, str(ROOT / "scripts"))
                        from render_poster import parse_poster_fields, render_poster
                        fields = parse_poster_fields(answer)
                        if not fields:
                            raise ValueError("数据包字段解析失败")
                        poster_path = ROOT / "outputs" / "posters" / f"poster_case{i}_{datetime.now():%Y%m%d_%H%M%S}.png"
                        render_poster(fields, fpath, poster_path)
                        answer += f"\n> 海报成品已生成：{poster_path}"
                        print(f"[完成] 海报成品已生成：{poster_path}")
                    except Exception as e:
                        answer += f"\n> ⚠️ 海报文字渲染失败：{e}"
                        print(f"[警告] 海报文字渲染失败：{e}")

        results.append((case, answer))

    # 5. 追加保存记录：docs/测试记录/<skill文件夹名>.md，轮次号自动递增
    skill_name = skill_path.parent.name  # 如 skills/rural-scriptwriter/SKILL.md -> rural-scriptwriter
    out_path = (ROOT / args.out) if args.out else ROOT / "docs" / "测试记录" / f"{skill_name}.md"
    round_no = next_round_number(out_path)
    header = (f"## 第{round_no}轮 | {datetime.now():%Y-%m-%d %H:%M} | "
              f"模型：{model} | 运行 {len(todo)}/{len(cases)} 条")
    append_record(out_path, header, results)


if __name__ == "__main__":
    main()
