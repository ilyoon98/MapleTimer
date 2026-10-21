import type { AlertConfig } from "../alerts/alertRunner";
import { DEFAULT_REPEAT } from "../alerts/alertRunner";
import type { SoundSpec } from "../alerts/audio";
import type { SavedRegion } from "../capture/types";
import type { StoredTemplate } from "../cv/match";
import { DEFAULT_CHANGE_OPTIONS, type ChangeMonitorOptions } from "../detect/changeMonitor";
import { DEFAULT_QUICKSLOT_OPTIONS, type QuickslotOptions, type ReadyReference } from "../detect/quickslotCast";
import { DEFAULT_RUNE_COLOR, type RuneColorRange } from "../detect/rune";
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
        minScore: 0.8,
        durationSec: null,
        leadSec: 20,
        alertOnDisappear: true,
        countdownVoice: false,
        readTime: true,
        alert: alertCfg(tts("버프가 곧 끝나요")),
      };
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

export interface TimerEntry {
  id: string;
  name: string;
  durationSec: number;
  leadSec: number;
  /** 끝나면 자동으로 다시 시작 */
  autoRestart: boolean;
  /** 버프 연계: 지정한 버프 아이콘이 나타나면 자동 시작 */
  linkedBuffId: string | null;
  alert: AlertConfig;
  /** 실행 중이면 종료 시각(ms) */
  endsAt: number | null;
  /** 일시정지 중이면 남은 시간(ms) */
  pausedRemainingMs: number | null;
}

export function newTimer(preset: TimerPreset): TimerEntry {
  return {
    id: uid(),
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
export type RegionKey = "minimap" | "stall" | "buffbar" | `skill:${string}`;

export type ThemeMode = "system" | "light" | "dark";

export interface Profile {
  v: 1;
  masterVolume: number;
  /** 모든 알림 소리 끄기 */
  muted: boolean;
  theme: ThemeMode;
  /** 화면 공유가 끊기면 알림 */
  alertOnShareEnd: boolean;
  randomDelay: boolean;
  skills: SkillEntry[];
  rune: RuneSettings;
  stall: StallSettings;
  buffs: BuffEntry[];
  timers: TimerEntry[];
  regions: Partial<Record<RegionKey, SavedRegion>>;
  panelOrder: PanelId[];
  collapsed: Partial<Record<PanelId, boolean>>;
}

export type PanelId = "skills" | "rune" | "stall" | "buffs" | "timers";
export const PANEL_IDS: PanelId[] = ["skills", "rune", "stall", "buffs", "timers"];

export function defaultProfile(): Profile {
  return {
    v: 1,
    masterVolume: 1,
    muted: false,
    theme: "system",
    alertOnShareEnd: true,
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
    timers: [newTimer(TIMER_PRESETS[0])],
    regions: {},
    panelOrder: [...PANEL_IDS],
    collapsed: {},
  };
}

function migrate(raw: unknown): Profile {
  const d = defaultProfile();
  if (!raw || typeof raw !== "object" || (raw as Profile).v !== 1) return d;
  const p = raw as Partial<Profile>;
  const order = (p.panelOrder ?? []).filter((x): x is PanelId => PANEL_IDS.includes(x as PanelId));
  for (const id of PANEL_IDS) if (!order.includes(id)) order.push(id);
  return {
    ...d,
    ...p,
    rune: { ...d.rune, ...p.rune, color: { ...d.rune.color, ...p.rune?.color } },
    stall: { ...d.stall, ...p.stall, sensitivity: { ...d.stall.sensitivity, ...p.stall?.sensitivity } },
    // 예전 버전에서 저장한 항목엔 새 필드가 없을 수 있음
    buffs: (p.buffs ?? []).map((b) => ({ readTime: b.kind === "expiry", ...(b as Partial<BuffEntry>) }) as BuffEntry),
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
