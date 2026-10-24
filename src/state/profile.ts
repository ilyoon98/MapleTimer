import type { AlertConfig } from "../alerts/alertRunner";
import { DEFAULT_REPEAT } from "../alerts/alertRunner";
import type { SoundSpec } from "../alerts/audio";
import type { SavedRegion } from "../capture/types";
import type { StoredTemplate } from "../cv/match";
import { DEFAULT_CHANGE_OPTIONS, type ChangeMonitorOptions } from "../detect/changeMonitor";
import { DEFAULT_QUICKSLOT_OPTIONS, type QuickslotOptions, type ReadyReference } from "../detect/quickslotCast";
import { DEFAULT_RUNE_COLOR, OLD_DEFAULT_RUNE_COLOR, type RuneColorRange } from "../detect/rune";
import { createPersistentStore } from "./createStore";

export const uid = () => Math.random().toString(36).slice(2, 10);

export function tts(text: string): SoundSpec {
  return { kind: "tts", text };
}

export function alertCfg(sound: SoundSpec, repeat = DEFAULT_REPEAT): AlertConfig {
  return { sound, volume: 1, repeat: { ...repeat } };
}

/* ───────── 스킬 (퀵슬롯 방식) ───────── */
export interface SkillPreset {
  id: string;
  name: string;
  durationSec: number;
  cooldownSec: number;
  editable?: boolean;
}

export const SKILL_PRESETS: SkillPreset[] = [
  { id: "sol-janus-2min", name: "솔 야누스 : 새벽 (2분)", durationSec: 120, cooldownSec: 56 },
  { id: "sol-janus-80s", name: "솔 야누스 : 새벽 (80초)", durationSec: 80, cooldownSec: 56 },
  { id: "sol-janus-70s", name: "솔 야누스 : 새벽 (70초)", durationSec: 70, cooldownSec: 56 },
  { id: "sol-janus-1min", name: "솔 야누스 : 새벽 (1분)", durationSec: 60, cooldownSec: 56 },
  { id: "erda-fountain", name: "에르다 파운틴", durationSec: 60, cooldownSec: 56 },
  { id: "hologram-barrier", name: "홀로그램 그래피티 : 역장 VI", durationSec: 60, cooldownSec: 60 },
  { id: "petrified", name: "페트리파이드 VI", durationSec: 60, cooldownSec: 60 },
  { id: "frozen-ground", name: "프로즌 그라운드 VI", durationSec: 60, cooldownSec: 60 },
  { id: "liberation-orb", name: "리버레이션 오브", durationSec: 30, cooldownSec: 120 },
  { id: "sword-of-burning-soul", name: "소드 오브 버닝 소울", durationSec: 117, cooldownSec: 120 },
  { id: "class-install", name: "직업 설치기", durationSec: 60, cooldownSec: 60, editable: true },
];

export const LEAD_MIN = -5;
export const LEAD_MIN_INSTALL = -20;
export const LEAD_MAX = 54;

export interface SkillEntry {
  id: string;
  enabled: boolean;
  presetId: string;
  name: string;
  durationSec: number;
  cooldownSec: number;
  /** 종료 몇 초 전에 알릴지 (음수면 종료 후) */
  leadSec: number;
  alert: AlertConfig;
  readyRef: ReadyReference | null;
  options: QuickslotOptions;
}

export function newSkill(presetId: string): SkillEntry {
  const p = SKILL_PRESETS.find((x) => x.id === presetId) ?? SKILL_PRESETS[0];
  return {
    id: uid(),
    enabled: true,
    presetId: p.id,
    name: p.name,
    durationSec: p.durationSec,
    cooldownSec: p.cooldownSec,
    leadSec: 10,
    alert: alertCfg(tts(`${shortName(p.name)} 곧 끝나요`)),
    readyRef: null,
    options: { ...DEFAULT_QUICKSLOT_OPTIONS },
  };
}

export function shortName(name: string) {
  return name.replace(/\s*\(.*\)\s*$/, "").replace(/\s*:\s*/, " ");
}

/* ───────── 룬 ───────── */
export interface RuneSettings {
  enabled: boolean;
  mode: "template" | "color";
  template: StoredTemplate | null;
  templateMinScore: number;
  color: RuneColorRange;
  alert: AlertConfig;
}

/* ───────── 사냥 멈춤 ───────── */
export type StallMode = "exp" | "cooldown" | "mana";
export const STALL_DEFAULT_SEC: Record<StallMode, number> = { exp: 7, cooldown: 5, mana: 5 };
export const STALL_RANGE: Record<StallMode, [number, number]> = { exp: [3, 120], cooldown: [1, 60], mana: [1, 120] };

export interface StallSettings {
  enabled: boolean;
  mode: StallMode;
  thresholdSec: number;
  sensitivity: ChangeMonitorOptions;
  /** 버프 연계: 지정한 버프(버프칸 감지 항목)가 떠 있을 때만 감시 */
  linkedBuffId: string | null;
  alert: AlertConfig;
}

/* ───────── 버프칸 감지 (버프 종료 / 특수 코어) ───────── */
export type BuffKind = "expiry" | "cooldown";

export interface BuffEntry {
  id: string;
  enabled: boolean;
  name: string;
  kind: BuffKind;
  template: StoredTemplate | null;
  minScore: number;
  /** expiry: 버프 지속시간(나타난 시점부터), cooldown: 쿨타임(나타난 시점부터). null 이면 시간 계산 안 함 */
  durationSec: number | null;
  leadSec: number;
  /** 아이콘이 사라지면 알림 (버프 종료) */
  alertOnDisappear: boolean;
  /** 알림 시점부터 0 까지 초 읽기 (특수 코어) */
  countdownVoice: boolean;
  /** 아이콘 위 남은 시간 숫자를 읽어 종료 시각을 맞춤 (정밀 감지) */
  readTime: boolean;
  /**
   * 정한 자리: 버프 즐겨찾기로 옮겨 둔 칸처럼 사용자가 직접 정한 위치. 있으면 그 자리만 확인하고,
   * 없으면 위쪽 버프칸 안에서 자동으로 찾는다 (원래 사이트 방식)
   */
  slot?: SavedRegion | null;
  alert: AlertConfig;
}

export type BuffPresetId = "buff" | "janus" | "fountain" | "core";
export const BUFF_PRESETS: Array<{ id: BuffPresetId; label: string }> = [
  { id: "buff", label: "+ 버프 종료" },
  { id: "janus", label: "+ 솔 야누스 (정밀)" },
  { id: "fountain", label: "+ 에르다 파운틴 (정밀)" },
  { id: "core", label: "+ 특수 코어" },
];

export function newBuffPreset(id: BuffPresetId): BuffEntry {
  if (id === "core") return newBuff("cooldown");
  const b = newBuff("expiry");
  if (id === "janus" || id === "fountain") {
    const name = id === "janus" ? "솔 야누스" : "에르다 파운틴";
    return { ...b, name, leadSec: 10, alertOnDisappear: false, alert: alertCfg(tts(`${name} 곧 끝나요`)) };
  }
  return b;
}

export function newBuff(kind: BuffKind): BuffEntry {
  return kind === "cooldown"
    ? {
        id: uid(),
        enabled: true,
        name: "특수 코어",
        kind,
        template: null,
        minScore: 0.8,
        durationSec: 30,
        leadSec: 5,
        alertOnDisappear: false,
        countdownVoice: true,
        readTime: false,
        alert: alertCfg(tts("특수 코어")),
      }
    : {
        id: uid(),
        enabled: true,
        name: "버프",
        kind,
        template: null,
        // 실제 게임: 진짜 야누스 아이콘은 0.97~0.99, 퀵슬롯의 다른 스킬 아이콘이 0.83 으로 잡혀 엉뚱한 알림이 울렸다
        minScore: 0.9,
        durationSec: null,
        leadSec: 20,
        alertOnDisappear: true,
        countdownVoice: false,
        readTime: true,
        alert: alertCfg(tts("버프가 곧 끝나요")),
      };
}

/* ───────── 부스터 종료 ───────── */
export interface BoosterSettings {
  enabled: boolean;
  /** 종료 몇 초 전에 알릴지 (음수면 종료 후) */
  leadSec: number;
  alert: AlertConfig;
}

/* ───────── 일반 타이머 ───────── */
export interface TimerPreset {
  name: string;
  sec: number;
}
export const TIMER_PRESETS: TimerPreset[] = [
  { name: "재물 획득의 비약 (30분)", sec: 1800 },
  { name: "경험치 축적의 비약 (30분)", sec: 1800 },
  { name: "경험치 쿠폰 (30분)", sec: 1800 },
  { name: "2시간 버프", sec: 7200 },
  { name: "유니온의 부 (10분)", sec: 600 },
  { name: "유니온의 부 (20분)", sec: 1200 },
  { name: "유니온의 행운 (10분)", sec: 600 },
  { name: "유니온의 행운 (20분)", sec: 1200 },
];
/** 타이머 줄에서 바로 고르는 시간 */
export const TIMER_QUICK_SECS = [1800, 1200, 600, 7200];

export interface TimerEntry {
  id: string;
  /** 꺼 두면 시작·알림·버프 연계·PIP 에서 빠진다 */
  enabled: boolean;
  name: string;
  durationSec: number;
  leadSec: number;
  /** 끝나면 자동으로 다시 시작 */
  autoRestart: boolean;
  /** 다시 시작하기 전 기다리는 시간(초) */
  autoRestartDelaySec?: number;
  /** 버프 연계: 지정한 버프 아이콘이 나타나면 자동 시작 */
  linkedBuffId: string | null;
  /** 연계한 버프가 사라지면 일시정지, 다시 나타나면 이어서 */
  pauseWithoutBuff?: boolean;
  alert: AlertConfig;
  /** 실행 중이면 종료 시각(ms) */
  endsAt: number | null;
  /** 일시정지 중이면 남은 시간(ms) */
  pausedRemainingMs: number | null;
}

export function newTimer(preset: TimerPreset): TimerEntry {
  return {
    id: uid(),
    enabled: true,
    name: preset.name,
    durationSec: preset.sec,
    leadSec: 10,
    autoRestart: false,
    linkedBuffId: null,
    alert: alertCfg(tts(`${shortName(preset.name)} 곧 끝나요`)),
    endsAt: null,
    pausedRemainingMs: null,
  };
}

/* ───────── 프로필 ───────── */
export type RegionKey = "minimap" | "stall" | "buffbar" | "booster" | `skill:${string}`;

export type ThemeMode = "system" | "light" | "dark";
export type PipSize = "small" | "medium" | "large";
export const PIP_SIZES: Record<PipSize, { label: string; width: number; height: number }> = {
  small: { label: "작게", width: 280, height: 240 },
  medium: { label: "보통", width: 360, height: 320 },
  large: { label: "크게", width: 520, height: 420 },
};
/** PIP 에 보여 줄 항목 ('next' = 가장 먼저 울릴 알림을 맨 위에 크게) */
export type PipItemKind = "next" | "skills" | "rune" | "stall" | "buffs" | "booster" | "timers";
export const PIP_ITEMS: Array<{ id: PipItemKind; label: string }> = [
  { id: "next", label: "다음 알림 크게" },
  { id: "skills", label: "스킬" },
  { id: "rune", label: "룬" },
  { id: "stall", label: "사냥 멈춤" },
  { id: "buffs", label: "버프칸" },
  { id: "booster", label: "부스터" },
  { id: "timers", label: "일반 타이머" },
];
/** PIP 알림색 (기본은 테마의 빨강) */
export type PipAlertColor = "theme" | "orange" | "yellow" | "green" | "blue" | "purple";
export const PIP_ALERT_COLORS: Record<PipAlertColor, { label: string; color: string | null }> = {
  theme: { label: "빨강 (기본)", color: null },
  orange: { label: "주황", color: "#f76b15" },
  yellow: { label: "노랑", color: "#e5b400" },
  green: { label: "초록", color: "#2f9e5a" },
  blue: { label: "파랑", color: "#3e63dd" },
  purple: { label: "보라", color: "#8e4ec6" },
};
/** 알림이 울릴 때 PIP 창을 얼마나 눈에 띄게 할지 */
export type PipEmphasis = "subtle" | "normal" | "strong" | "flash";
export const PIP_EMPHASIS: Record<PipEmphasis, string> = {
  subtle: "은은하게 (울리는 항목만 표시)",
  normal: "보통 (창 테두리 깜빡임)",
  strong: "강하게 (창 전체를 알림색으로)",
  flash: "점멸 (창 전체가 깜빡임)",
};

export interface Profile {
  v: 1;
  masterVolume: number;
  /** 모든 알림 소리 끄기 */
  muted: boolean;
  theme: ThemeMode;
  /** 화면 공유가 끊기면 알림 */
  alertOnShareEnd: boolean;
  pipSize: PipSize;
  /** PIP 표시: 사냥(전체 목록) / 특수 코어(크게 하나) */
  pipMode: "hunting" | "core";
  pipShow: Record<PipItemKind, boolean>;
  pipEmphasis: PipEmphasis;
  pipAlertColor: PipAlertColor;
  /** PIP 배경에 공유 중인 게임 화면 깔기 */
  pipBackground: boolean;
  /** 음성 읽기 목소리(voiceURI)와 속도 */
  ttsVoice: string | null;
  ttsRate: number;
  randomDelay: boolean;
  skills: SkillEntry[];
  rune: RuneSettings;
  stall: StallSettings;
  buffs: BuffEntry[];
  booster: BoosterSettings;
  timers: TimerEntry[];
  regions: Partial<Record<RegionKey, SavedRegion>>;
  panelOrder: PanelId[];
  collapsed: Partial<Record<PanelId | "checklist", boolean>>;
}

export type PanelId = "skills" | "rune" | "stall" | "buffs" | "booster" | "timers";
export const PANEL_IDS: PanelId[] = ["skills", "rune", "stall", "buffs", "booster", "timers"];

export function defaultProfile(): Profile {
  return {
    v: 1,
    masterVolume: 1,
    muted: false,
    theme: "system",
    alertOnShareEnd: true,
    pipSize: "medium",
    pipMode: "hunting",
    pipShow: { next: true, skills: true, rune: true, stall: true, buffs: true, booster: true, timers: true },
    pipEmphasis: "normal",
    pipAlertColor: "theme",
    pipBackground: false,
    ttsVoice: null,
    ttsRate: 1.1,
    randomDelay: false,
    skills: [newSkill("sol-janus-2min"), newSkill("erda-fountain")],
    rune: {
      enabled: true,
      mode: "color",
      template: null,
      templateMinScore: 0.75,
      color: { ...DEFAULT_RUNE_COLOR },
      alert: alertCfg(tts("룬이 나타났어요")),
    },
    stall: {
      enabled: false,
      mode: "exp",
      thresholdSec: STALL_DEFAULT_SEC.exp,
      sensitivity: { ...DEFAULT_CHANGE_OPTIONS },
      linkedBuffId: null,
      alert: alertCfg(tts("사냥이 멈춘 것 같아요")),
    },
    buffs: [],
    booster: { enabled: false, leadSec: 10, alert: alertCfg(tts("부스터 곧 끝나요")) },
    timers: [newTimer(TIMER_PRESETS[0])],
    regions: {},
    panelOrder: [...PANEL_IDS],
    collapsed: {},
  };
}

function sameColor(a: RuneColorRange | undefined, b: RuneColorRange) {
  return !!a && (Object.keys(b) as Array<keyof RuneColorRange>).every((k) => a[k] === b[k]);
}

/** 저장된(또는 파일·프리셋에서 불러온) 설정을 지금 형식에 맞춘다 */
export function migrate(raw: unknown): Profile {
  const d = defaultProfile();
  if (!raw || typeof raw !== "object" || (raw as Profile).v !== 1) return d;
  const p = raw as Partial<Profile>;
  const order = (p.panelOrder ?? []).filter((x): x is PanelId => PANEL_IDS.includes(x as PanelId));
  // 새로 생긴 패널은 원래 자리(앞 패널 바로 뒤)에 끼워 넣는다
  PANEL_IDS.forEach((id, i) => {
    if (order.includes(id)) return;
    const after = PANEL_IDS[i - 1];
    const at = after ? order.indexOf(after) + 1 : 0;
    order.splice(at > 0 ? at : order.length, 0, id);
  });
  return {
    ...d,
    ...p,
    rune: {
      ...d.rune,
      ...p.rune,
      // 예전 기본 색 범위를 그대로 쓰고 있으면 실제 게임에서 다듬은 새 기본값으로
      color: sameColor(p.rune?.color, OLD_DEFAULT_RUNE_COLOR) ? { ...d.rune.color } : { ...d.rune.color, ...p.rune?.color },
    },
    booster: { ...d.booster, ...p.booster },
    pipShow: { ...d.pipShow, ...p.pipShow },
    stall: { ...d.stall, ...p.stall, sensitivity: { ...d.stall.sensitivity, ...p.stall?.sensitivity } },
    // 예전 버전에서 저장한 항목엔 새 필드가 없을 수 있음
    buffs: (p.buffs ?? []).map((b) => ({ readTime: b.kind === "expiry", ...(b as Partial<BuffEntry>) }) as BuffEntry),
    timers: (p.timers ?? d.timers).map((t) => ({ enabled: true, ...(t as Partial<TimerEntry>) }) as TimerEntry),
    regions: { ...p.regions },
    panelOrder: order,
  } as Profile;
}

export const profileStore = createPersistentStore<Profile>("maple-timer-personal.profile.v1", defaultProfile(), migrate);

/** 프로필 일부만 바꾸는 헬퍼 */
export function updateSkill(id: string, patch: Partial<SkillEntry>) {
  profileStore.set((s) => ({ ...s, skills: s.skills.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
}
export function updateBuff(id: string, patch: Partial<BuffEntry>) {
  profileStore.set((s) => ({ ...s, buffs: s.buffs.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
}
export function updateTimer(id: string, patch: Partial<TimerEntry>) {
  profileStore.set((s) => ({ ...s, timers: s.timers.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
}
export function setRegion(key: RegionKey, r: SavedRegion | null) {
  profileStore.set((s) => {
    const regions = { ...s.regions };
    if (r) regions[key] = r;
    else delete regions[key];
    return { ...s, regions };
  });
}
