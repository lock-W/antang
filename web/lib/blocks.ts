/**
 * 消息分块：把模型回复中的「海报数据包」「热点卡片」从正文里分离出来，
 * 前端分别用 PosterCard / HotspotCardView 渲染，正文用 markdown 渲染。
 */

import type { FeatureId } from "./skills";
import {
  extractPosterBlocks,
  parsePosterFields,
  type PosterFields,
} from "./poster";
import { parseHotspotCards, type HotspotCard } from "./hotspot";

export interface MessageBlocks {
  /** 去掉特殊块后的正文（markdown） */
  rest: string;
  /** 海报数据包（可能多个，每个由 PosterCard 渲染） */
  posterBlocks: PosterFields[];
  /** 热点卡片（热点雷达且有卡片结构时） */
  cards?: HotspotCard[];
}

export function splitBlocks(reply: string, feature: FeatureId): MessageBlocks {
  let rest = reply;

  // 1) 海报数据包（一次回复可含多个，如【海报数据包 1/2】【海报数据包 2/2】）
  const rawBlocks = extractPosterBlocks(reply);
  const posterBlocks = rawBlocks
    .map((b) => parsePosterFields(b))
    .filter((f): f is PosterFields => f !== null);
  for (const b of rawBlocks) {
    const idx = rest.indexOf(b);
    if (idx !== -1) {
      rest = rest.slice(0, idx) + rest.slice(idx + b.length);
    }
  }

  // 2) 热点卡片（仅热点雷达页）
  let cards: HotspotCard[] | undefined;
  if (feature === "hotspot-radar") {
    const parsed = parseHotspotCards(reply);
    if (parsed) {
      cards = parsed;
      // 去掉卡片块（从第一个 ### 卡片 到最后一个卡片块结束）
      const cardStart = rest.search(/###\s*卡片\s*\d+/);
      if (cardStart !== -1) {
        // 找最后一张卡片块的结束：最后一张卡片块后面通常跟 --- 或结尾
        const lastMatch = [...rest.matchAll(/###\s*卡片\s*\d+\s*｜[^\n]*/g)].pop();
        if (lastMatch) {
          const end = lastMatch.index! + lastMatch[0].length;
          // 卡片体结束于下一个 --- 分隔或下一个 ### 
          const nextHr = rest.indexOf("\n---", end);
          const nextHeading = rest.indexOf("\n###", end + 1);
          let cut = rest.length;
          if (nextHr !== -1 && nextHr < cut) cut = nextHr;
          if (nextHeading !== -1 && nextHeading < cut) cut = nextHeading;
          rest = rest.slice(0, cardStart) + rest.slice(cut);
        }
      }
    }
  }

  return { rest: rest.trim(), posterBlocks, cards };
}
