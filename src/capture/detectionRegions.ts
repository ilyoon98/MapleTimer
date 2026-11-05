import type { Profile } from "../state/profile";
import { regionValidFor, type SavedRegion } from "./types";

export type FavoritesPosition = "left" | "right" | "manual";

export function autoBuffbarRegion(frameW:number,frameH:number):SavedRegion {
  const x=Math.round(frameW*.5);
  return {x,y:0,w:frameW-x,h:Math.round(frameH*.3),frameW,frameH};
}

export function favoritesRegion(p: Pick<Profile, "favoritesPosition" | "regions">, frameW: number, frameH: number): SavedRegion | undefined {
  if (p.favoritesPosition === "manual") return p.regions.favorites;
  if (frameW <= 0 || frameH <= 0) return undefined;
  const mid = Math.floor(frameW / 2);
  const x = p.favoritesPosition === "left" ? 0 : mid;
  const y = Math.floor(frameH / 2);
  // 퀵슬롯의 같은 스킬 아이콘을 버프로 읽지 않도록 하단 두 줄을 제외한다.
  const bottom = Math.min(112, Math.round(frameH * .2));
  return { x, y, w: p.favoritesPosition === "left" ? mid : frameW - mid, h: frameH - bottom - y, frameW, frameH };
}

/** 경험치 숫자 줄: 가로는 중앙 40%, 세로만 사용자가 맞춘다. */
export function experienceRegion(frameW: number, frameH: number, heightRatio?: number | null): SavedRegion {
  const h = Math.min(20, frameH);
  const center = heightRatio == null ? frameH - 10 : frameH * (1 - heightRatio);
  const y = Math.max(0, Math.min(frameH - h, Math.round(center - h / 2)));
  const x = Math.round(frameW * .3);
  return { x, y, w: Math.round(frameW * .7) - x, h, frameW, frameH };
}

export function stallRegion(p: Pick<Profile, "stall" | "regions">, frameW: number, frameH: number): SavedRegion | undefined {
  return p.stall.mode === "exp" ? experienceRegion(frameW, frameH, p.stall.expHeightRatio) : p.regions.stall;
}

export function regionSignature(region: SavedRegion | undefined): string {
  return region && regionValidFor(region, region.frameW, region.frameH)
    ? `${region.frameW}x${region.frameH}:${region.x},${region.y},${region.w},${region.h}` : "none";
}
