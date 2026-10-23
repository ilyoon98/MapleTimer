import { onAlertLog, type AlertLogEntry } from "../alerts/alertRunner";
import type { IconState } from "../detect/quickslotCast";
import type { RuneBox } from "../detect/rune";
import { createStore } from "../state/createStore";

/* ───────── 화면에 보여줄 실시간 상태 ───────── */
export interface SkillLive {
  regionOk: boolean;
  iconState: IconState;
  diff: number;
  lumaRatio: number;
  castAt: number | null;
  expiresAt: number | null;
  lastAlertAt: number | null;
  /** 읽은 쿨타임 숫자 */
  digitText: string | null;
  digitConf: number;
  /** 숫자 학습 상태 */
  learning: boolean;
  learnObserved: number;
  learnMessage: string | null;
}
export interface RuneLive {
  status: "off" | "no-share" | "no-region" | "searching" | "candidate" | "present" | "dark";
  boxes: RuneBox[];
  lastAlertAt: number | null;
}
export interface StallLive {
  status: "off" | "no-share" | "no-region" | "waiting" | "watching" | "stalled" | "gated";
  idleMs: number;
  changedCells: number;
  totalCells: number;
  lastAlertAt: number | null;
}
export interface BuffLive {
  regionOk: boolean;
  present: boolean;
  score: number;
  colorDist: number;
  endsAt: number | null;
  lastAlertAt: number | null;
  /** 아이콘에서 읽은 남은 시간 */
  readText: string | null;
}
export interface BoosterLive {
  status: "off" | "no-share" | "no-region" | "searching" | "reading" | "running";
  readText: string | null;
  endsAt: number | null;
  lastAlertAt: number | null;
}
export interface LiveState {
  now: number;
  booster: BoosterLive;
  skills: Record<string, SkillLive>;
  rune: RuneLive;
  stall: StallLive;
  buffs: Record<string, BuffLive>;
  log: AlertLogEntry[];
  /** 지금 울리거나 반복 중인 알림 이름 */
  ringing: string[];
  /** 공유는 이어져 있지만 새 화면이 한동안 안 들어옴 (게임 창 최소화 등) */
  captureStale: boolean;
  /** 공유 화면이 계속 새까맣게만 들어옴 (창 공유가 안 되는 그래픽 모드) */
  captureBlack: boolean;
  /** 맵 이동 등으로 화면이 잠깐 어두워져 감지를 쉬는 중 */
  screenTransition: boolean;
  /** 한 번 감지 돌리는 데 걸린 시간(ms): 평균과 최근 최대 */
  perf: { avgMs: number; maxMs: number };
}

export const liveStore = createStore<LiveState>({
  now: Date.now(),
  booster: { status: "off", readText: null, endsAt: null, lastAlertAt: null },
  skills: {},
  rune: { status: "off", boxes: [], lastAlertAt: null },
  stall: { status: "off", idleMs: 0, changedCells: 0, totalCells: 0, lastAlertAt: null },
  buffs: {},
  log: [],
  ringing: [],
  captureStale: false,
  captureBlack: false,
  screenTransition: false,
  perf: { avgMs: 0, maxMs: 0 },
});

/** 진단 화면에서 보여줄 마지막 잘라낸 영역 이미지 */
export const debugCrops = new Map<string, ImageData>();

onAlertLog((e) => liveStore.set((s) => ({ ...s, log: [e, ...s.log].slice(0, 30) })));
