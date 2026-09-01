/**
 * 安塘智宣 · 4 个功能（skill）的统一配置
 *
 * 数据来源：skills/<id>/SKILL.md + knowledge/ 知识库文件
 * 后端 /api/chat 根据 feature 读取这里配置的 SKILL.md 和知识库，拼 system prompt。
 */

export type FeatureId =
  | "rural-scriptwriter"
  | "live-coach"
  | "hotspot-radar"
  | "promo-materials";

export interface FeatureConfig {
  id: FeatureId;
  /** 功能名（页面标题） */
  name: string;
  /** 一句话简介（首页入口） */
  tagline: string;
  /** 首页入口卡片 emoji */
  icon: string;
  /** 聊天输入框 placeholder */
  placeholder: string;
  /** 对话里固定展示的合规提示 */
  complianceNotice: string;
  /** 是否有「刷新今日热榜」按钮 */
  hasHotlistButton: boolean;
  /** 是否需要开场引导菜单（物料工坊） */
  hasGuideMenu: boolean;
  /** 对应 SKILL.md 相对项目根目录的路径 */
  skillPath: string;
  /** 拼 system prompt 时附加的知识库文件（相对项目根目录） */
  kbFiles: string[];
}

export const FEATURES: Record<FeatureId, FeatureConfig> = {
  "rural-scriptwriter": {
    id: "rural-scriptwriter",
    name: "乡土编剧",
    tagline: "给六大农产品写 30-60 秒短视频拍摄脚本，手机就能拍",
    icon: "🎬",
    placeholder: "描述你想宣传的产品，比如：帮我写凤梨的宣传视频脚本…",
    complianceNotice: "AI 起草，请核对事实后再发布",
    hasHotlistButton: false,
    hasGuideMenu: false,
    skillPath: "skills/rural-scriptwriter/SKILL.md",
    kbFiles: [
      "knowledge/产品卡/金钻凤梨.md",
      "knowledge/产品卡/红营茶.md",
      "knowledge/产品卡/安塘丝苗米.md",
      "knowledge/产品卡/传统松岗粉.md",
      "knowledge/产品卡/深山农家土蜂蜜.md",
      "knowledge/产品卡/本土夏威夷果.md",
      "knowledge/品牌话术规范.md",
      "knowledge/广告法违禁词.md",
      "knowledge/运营经验库.md",
    ],
  },
  "live-coach": {
    id: "live-coach",
    name: "直播话术教练",
    tagline: "直播流程、话术逻辑图、救场话术，还能扮演观众陪你练",
    icon: "📡",
    placeholder: "比如：我下周直播卖凤梨，帮我弄个 2 小时的直播稿…",
    complianceNotice: "AI 起草，请核对事实后再开播",
    hasHotlistButton: false,
    hasGuideMenu: false,
    skillPath: "skills/live-coach/SKILL.md",
    kbFiles: [
      "knowledge/产品卡/金钻凤梨.md",
      "knowledge/产品卡/红营茶.md",
      "knowledge/产品卡/安塘丝苗米.md",
      "knowledge/产品卡/传统松岗粉.md",
      "knowledge/产品卡/深山农家土蜂蜜.md",
      "knowledge/产品卡/本土夏威夷果.md",
      "knowledge/品牌话术规范.md",
      "knowledge/广告法违禁词.md",
      "knowledge/运营经验库.md",
    ],
  },
  "hotspot-radar": {
    id: "hotspot-radar",
    name: "热点雷达",
    tagline: "结合时令日历和当日热榜，推荐 3 个可拍的选题",
    icon: "📡",
    placeholder: "问「今天拍什么」，或点下面的「刷新今日热榜」…",
    complianceNotice: "AI 建议，请核对后再发",
    hasHotlistButton: true,
    hasGuideMenu: false,
    skillPath: "skills/hotspot-radar/SKILL.md",
    kbFiles: [
      "knowledge/年度内容日历.md",
      "knowledge/产品卡/金钻凤梨.md",
      "knowledge/产品卡/红营茶.md",
      "knowledge/产品卡/安塘丝苗米.md",
      "knowledge/产品卡/传统松岗粉.md",
      "knowledge/产品卡/深山农家土蜂蜜.md",
      "knowledge/产品卡/本土夏威夷果.md",
      "knowledge/品牌话术规范.md",
      "knowledge/广告法违禁词.md",
      "knowledge/运营经验库.md",
    ],
  },
  "promo-materials": {
    id: "promo-materials",
    name: "物料工坊",
    tagline: "朋友圈文案、海报、违禁词检测与改写，一条龙",
    icon: "🖼️",
    placeholder: "回复数字选择：1️⃣ 写文案 2️⃣ 做海报 3️⃣ 查违禁词",
    complianceNotice: "AI 起草，请核对事实后再发布",
    hasHotlistButton: false,
    hasGuideMenu: true,
    skillPath: "skills/promo-materials/SKILL.md",
    kbFiles: [
      "knowledge/01_安塘礼伴品牌介绍（补全版）.md",
      "knowledge/产品卡/金钻凤梨.md",
      "knowledge/产品卡/红营茶.md",
      "knowledge/产品卡/安塘丝苗米.md",
      "knowledge/产品卡/传统松岗粉.md",
      "knowledge/产品卡/深山农家土蜂蜜.md",
      "knowledge/产品卡/本土夏威夷果.md",
      "knowledge/品牌话术规范.md",
      "knowledge/广告法违禁词.md",
    ],
  },
};

export const FEATURE_LIST: FeatureConfig[] = [
  FEATURES["rural-scriptwriter"],
  FEATURES["hotspot-radar"],
  FEATURES["promo-materials"],
  FEATURES["live-coach"],
];

/** 物料工坊开场引导菜单（决策记录 D-07：UI 承接，不能只靠模型输出） */
export const MATERIAL_GUIDE = {
  title: "我可以帮你做三件事，回个数字就行：",
  options: [
    { key: "1", label: "写文案", desc: "朋友圈 / 社群通知 / 视频号发布文案" },
    { key: "2", label: "做海报", desc: "产品展示 / 价格标签 / 活动海报" },
    { key: "3", label: "检查或改写文案违禁词", desc: "把一段文案发给我，我帮你体检" },
  ],
};
