import { describe, expect, it, vi } from "vitest";
vi.mock("./connect", () => ({ connectMaple: () => {} }));
vi.mock("./pickers", () => ({ pickBuffbar: () => {}, pickFavorites: () => {}, pickMinimap: () => {}, pickStallRegion: () => {} }));
vi.mock("./focus", () => ({ focusPanel: () => {} }));
vi.mock("../capture/screenCapture", () => ({ screenCapture: { state: "idle", width: 0, height: 0 } }));
import { AUTO_FIND_GRACE_MS, computeIssues, type CaptureView } from "./issues";
import { defaultProfile, type Profile } from "../state/profile";

const W = 1920, H = 1080;
const live: CaptureView = { state: "live", width: W, height: H, stale: false, black: false };
const quiet = (over: Partial<Profile> = {}): Profile => {
  const b = defaultProfile();
  return { ...b, rune: { ...b.rune, enabled: false }, stall: { ...b.stall, enabled: false }, booster: { ...b.booster, enabled: false }, buffs: [], ...over };
};
const keys = (p: Profile, cap: CaptureView, now = 0, seen = new Map<string, number>()) => computeIssues(p, cap, now, seen).map((i) => i.key);

describe("준비 안내", () => {
  it("문제가 없으면 아무것도 안내하지 않는다", () => {
    expect(keys(quiet(), live)).toEqual([]);
  });
  it("연결 전·연결 중에는 연결만 안내한다", () => {
    expect(keys(defaultProfile(), { ...live, state: "idle" })).toEqual(["share"]);
    expect(keys(defaultProfile(), { ...live, state: "starting" })).toEqual([]);
  });
  it("화면이 멈추거나 검으면 그것 하나만 안내한다", () => {
    expect(keys(defaultProfile(), { ...live, stale: true })).toEqual(["stale"]);
    expect(keys(defaultProfile(), { ...live, black: true, stale: true })).toEqual(["black"]);
  });
  it("정밀 스킬만 쓰면 영역을 요구하지 않고, 즐겨찾기를 직접 지정하면 위치를 묻는다", () => {
    const p = quiet();
    expect(keys(p, live)).toEqual([]);
    const fav = quiet({ favoritesPosition: "manual", skills: p.skills.map((s) => ({ ...s, where: "favorites" as const })) });
    expect(keys(fav, live)).toEqual(["favorites"]);
  });
  it("미니맵은 자동으로 찾을 시간을 준 뒤에만 안내한다", () => {
    const p = quiet({ rune: { ...defaultProfile().rune, enabled: true } });
    const seen = new Map<string, number>();
    expect(keys(p, live, 0, seen)).toEqual([]);
    expect(keys(p, live, AUTO_FIND_GRACE_MS, seen)).toEqual(["minimap"]);
    // 찾으면 기다린 시간도 지운다
    const found = { ...p, regions: { minimap: { x: 0, y: 0, w: 200, h: 150, frameW: W, frameH: H } } };
    expect(keys(found, live, AUTO_FIND_GRACE_MS + 1, seen)).toEqual([]);
    expect(seen.size).toBe(0);
  });
  it("경험치 방식 사냥 멈춤은 영역을 요구하지 않는다", () => {
    const b = defaultProfile();
    expect(keys(quiet({ stall: { ...b.stall, enabled: true, mode: "exp" } }), live)).toEqual([]);
    expect(keys(quiet({ stall: { ...b.stall, enabled: true, mode: "mana" } }), live)).toEqual(["stall"]);
  });
  it("기능 칸 문제는 그 칸에, 연결·화면 문제는 맨 위에 보여 준다", () => {
    const b = defaultProfile();
    const p = quiet({ stall: { ...b.stall, enabled: true, mode: "mana" }, favoritesPosition: "manual", skills: b.skills.map((s) => ({ ...s, where: "favorites" as const })) });
    const list = computeIssues(p, live, 0, new Map());
    expect(Object.fromEntries(list.map((i) => [i.key, i.panel]))).toEqual({ favorites: "skills", stall: "stall" });
    expect(computeIssues(p, { ...live, stale: true }, 0, new Map())[0].panel).toBeUndefined();
  });
});
