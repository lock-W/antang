# OCR 图片文字识别（Windows 自带引擎）

> 能力说明：当前对话模型（deepseek-v4-flash）不支持直接读图（read_image 会报错）。
> 通过本工具调用 **Windows 自带 OCR（WinRT OcrEngine，zh-Hans-CN 语言包）** 提取图片文字，
> 实现"间接看图"——适合说明图、截图、海报文字等以文字为主的图片。
> 局限：只能读文字，不能理解画面构图/人物/表情（如需画面理解，需切换支持视觉的模型）。

## 用法

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\ocr.ps1 <图片路径> [语言]
```

- 语言默认 `zh-Hans`（中文），可传 `en-US`
- 输出为 UTF-8，在 pwsh 侧需先设置 `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)` 再调用，避免 GBK 乱码
- 无可用 OCR 语言包时返回 `[ERROR]`

## 实测记录

2026-08-25：成功识别「一些说明.jpg」——内容为交接人给网页端开发的文件清单说明图
（skills/ 4 个 SKILL、knowledge/ 产品卡与规范、scripts/ 3 个脚本、docs/ 决策记录与测试记录、
outputs/posters/ 海报样例、.env.example），与已分类的目录结构完全吻合。

## 替代方案（如需画面理解）

1. 切换支持图片输入的模型（若部署可用）
2. 接入视觉 API（OpenAI / 通义 / 智谱等，需额外 key）
3. pip 安装 rapidocr-onnxruntime（离线 CPU 中文 OCR，效果更强但体积大）
