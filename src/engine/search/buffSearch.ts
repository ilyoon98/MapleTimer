/**
 * 버프칸 전체에서 아이콘을 찾는 무거운 계산 (영역이 넓으면 0.1초).
 * 화면(DOM)에 손대지 않아서 워커와 메인 스레드 양쪽에서 같은 코드를 쓴다.
 */
import { gameIconTemplates, type GameIconId } from "../../cv/gameIcons";
import { toGray, type Gray, type Pixels } from "../../cv/image";
import { findTemplate, prepareTemplate, type PreparedTemplate, type StoredTemplate } from "../../cv/match";

/** 비교할 아이콘 하나: 게임 아이콘 이름 또는 사용자가 등록한 그림 (key 가 같으면 같은 아이콘) */
export interface TemplateDef {
  key: string;
  icon?: GameIconId;
  stored?: StoredTemplate;
}

export interface SearchRegion {
  key: string;
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface SearchItem {
  buffId: string;
  regionKey: string;
  templateKey: string;
}

export interface SearchHit {
  buffId: string;
  /** 가장 비슷한 곳 (영역 기준 좌표). 아무 데도 없으면 null */
  best: { x: number; y: number; score: number; colorDist: number; tplIdx: number } | null;
}

/** 준비한 아이콘 보관소 (같은 아이콘을 매번 다시 준비하지 않게) */
export class TemplateBank {
  private map = new Map<string, PreparedTemplate[]>();
  has(key: string) {
    return this.map.has(key);
  }
  define(def: TemplateDef) {
    if (this.map.has(def.key)) return;
    if (def.icon) this.map.set(def.key, gameIconTemplates(def.icon));
    else if (def.stored) this.map.set(def.key, [prepareTemplate(def.stored)]);
  }
  get(key: string): PreparedTemplate[] {
    return this.map.get(key) ?? [];
  }
}

export function runSearch(bank: TemplateBank, regions: SearchRegion[], items: SearchItem[]): SearchHit[] {
  const grays = new Map<string, { img: Pixels; gray: Gray }>();
  const imageOf = (key: string) => {
    let g = grays.get(key);
    if (!g) {
      const r = regions.find((x) => x.key === key);
      if (!r) return null;
      const img: Pixels = { width: r.width, height: r.height, data: r.data };
      g = { img, gray: toGray(img) };
      grays.set(key, g);
    }
    return g;
  };
  return items.map((it) => {
    const src = imageOf(it.regionKey);
    let best: SearchHit["best"] = null;
    if (src)
      bank.get(it.templateKey).forEach((t, tplIdx) => {
        const m = findTemplate(src.img, src.gray, t, 1)[0];
        if (m && (!best || m.score > best.score)) best = { x: m.x, y: m.y, score: m.score, colorDist: m.colorDist, tplIdx };
      });
    return { buffId: it.buffId, best };
  });
}
