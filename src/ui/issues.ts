/**
 * 준비 안내: 사용자가 손볼 수 있는 문제만, 한 문장과 해결 버튼으로.
 * 문제가 없으면 아무것도 보여 주지 않는다 (잘 되는 것·선택 사항은 안내하지 않음).
 */
import { favoritesRegion, stallRegion } from "../capture/detectionRegions";
import { screenCapture, type CaptureState } from "../capture/screenCapture";
import { regionValidFor } from "../capture/types";
import { liveStore } from "../engine/live";
import { preciseIcon, profileStore, type PanelId, type Profile } from "../state/profile";
import { connectMaple } from "./connect";
import { focusPanel } from "./focus";
import { pickBuffbar, pickFavorites, pickMinimap, pickStallRegion } from "./pickers";

export interface Issue {
  key: string;
  /** 본 화면 안내 (한 문장) */
  text: string;
  /** PIP 처럼 좁은 곳에 쓰는 짧은 말 */
  short: string;
  action?: { label: string; run: () => void };
  /** 이 문제를 보여 줄 기능 칸 (없으면 맨 위 안내 줄: 연결·화면 문제) */
  panel?: PanelId;
}

export interface CaptureView {
  state: CaptureState;
  width: number;
  height: number;
  stale: boolean;
  black: boolean;
}

/** 자동으로 찾는 영역은 찾을 시간을 준다: 이만큼 계속 못 찾았을 때만 안내 */
export const AUTO_FIND_GRACE_MS = 15_000;

export function computeIssues(p: Profile, cap: CaptureView, now: number, firstSeen: Map<string, number>): Issue[] {
  const seen = new Set<string>();
  /** cond 가 graceMs 넘게 이어졌는지 */
  const lasting = (key: string, cond: boolean, graceMs: number) => {
    if (!cond) return false;
    seen.add(key);
    const at = firstSeen.get(key) ?? now;
    firstSeen.set(key, at);
    return now - at >= graceMs;
  };
  const done = (list: Issue[]) => {
    for (const k of [...firstSeen.keys()]) if (!seen.has(k)) firstSeen.delete(k);
    return list;
  };

  if (cap.state === "starting") return done([]);
  if (cap.state !== "live")
    return done([
      cap.state === "ended"
        ? { key: "share", text: "화면 공유가 끊겼어요", short: "공유 끊김", action: { label: "다시 연결", run: connectMaple } }
        : { key: "share", text: "메이플을 연결해 주세요", short: "연결 안 됨", action: { label: "메이플 연결", run: connectMaple } },
    ]);
  // 화면이 안 들어오면 나머지 판단은 의미가 없다
  if (cap.black)
    return done([{ key: "black", text: "화면이 검게 나와요 · 모니터 전체를 공유해 보세요", short: "화면이 검음", action: { label: "다른 창 선택", run: connectMaple } }]);
  if (cap.stale)
    return done([{ key: "stale", text: "화면이 멈췄어요 · 게임 창을 최소화하지 마세요", short: "화면 멈춤", action: { label: "다시 연결", run: connectMaple } }]);

  const { width: w, height: h } = cap;
  const out: Issue[] = [];
  const ok = (r: Parameters<typeof regionValidFor>[0]) => regionValidFor(r, w, h);

  if (p.skills.some((s) => s.enabled && preciseIcon(s) && s.where === "favorites") && !ok(favoritesRegion(p, w, h)))
    out.push({ key: "favorites", panel: "skills", text: "버프 즐겨찾기 위치를 정해 주세요", short: "즐겨찾기 위치 필요", action: { label: "위치 정하기", run: pickFavorites } });

  if (lasting("minimap", p.rune.enabled && !ok(p.regions.minimap), AUTO_FIND_GRACE_MS))
    out.push({ key: "minimap", panel: "rune", text: "미니맵을 못 찾았어요", short: "미니맵 못 찾음", action: { label: "직접 지정", run: pickMinimap } });

  if (p.stall.enabled && !ok(stallRegion(p, w, h)))
    out.push({ key: "stall", panel: "stall", text: "사냥 멈춤을 볼 영역을 정해 주세요", short: "사냥 멈춤 영역 필요", action: { label: "영역 정하기", run: pickStallRegion } });

  const buffs = p.buffs.filter((b) => b.enabled);
  // 버프 종료 알림·특수 코어 알림 칸에 따로 보여 준다
  for (const [kind, panel] of [["expiry", "buffs"], ["cooldown", "core"]] as const) {
    const list = buffs.filter((b) => b.kind === kind);
    const noIcon = list.filter((b) => !b.template && !b.icon);
    if (noIcon.length)
      out.push({
        key: `${panel}-icon`,
        panel,
        text: noIcon.length === 1 ? `'${noIcon[0].name}' 아이콘을 등록해 주세요` : `아이콘 ${noIcon.length}개를 등록해 주세요`,
        short: "버프 아이콘 필요",
        action: { label: "보기", run: () => focusPanel(panel) },
      });
    if (list.some((b) => !b.slot) && !ok(p.regions.buffbar))
      out.push({ key: `${panel}-bar`, panel, text: "버프칸을 정해 주세요", short: "버프칸 영역 필요", action: { label: "영역 정하기", run: pickBuffbar } });
    const badSlot = list.find((b) => b.slot && !ok(b.slot));
    if (badSlot)
      out.push({ key: `${panel}-slot`, panel, text: `'${badSlot.name}' 위치를 다시 정해 주세요`, short: "버프 위치 필요", action: { label: "보기", run: () => focusPanel(panel) } });
  }
  return done(out);
}

const firstSeen = new Map<string, number>();

/** 지금 안내할 문제 목록 (화면 상태가 바뀔 때마다 다시 계산) */
export function useIssues(): Issue[] {
  const p = profileStore.use((s) => s);
  const live = liveStore.use((s) => s);
  return computeIssues(
    p,
    { state: screenCapture.state, width: screenCapture.width, height: screenCapture.height, stale: live.captureStale, black: live.captureBlack },
    live.now,
    firstSeen,
  );
}
