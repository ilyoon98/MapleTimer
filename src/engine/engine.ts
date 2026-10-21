import { AlertRunner, onAlertLog, randomDelaySetting, type AlertConfig, type AlertLogEntry } from "../alerts/alertRunner";
import { audioEngine } from "../alerts/audio";
import { screenCapture } from "../capture/screenCapture";
import { regionValidFor } from "../capture/types";
import { toGray } from "../cv/image";
import { findTemplate, prepareTemplate, type PreparedTemplate, type StoredTemplate } from "../cv/match";
import { ChangeMonitor } from "../detect/changeMonitor";
import { PresenceTracker } from "../detect/presence";
import { QuickslotCastDetector, type IconState } from "../detect/quickslotCast";
import { RuneTracker, detectRuneByColor, detectRuneByTemplate, type RuneBox } from "../detect/rune";
import { appTicker } from "../core/ticker";
import { createStore } from "../state/createStore";
import { profileStore, shortName, updateTimer, type BuffEntry, type Profile, type SkillEntry } from "../state/profile";
import { tts } from "../state/profile";

/* ───────── 화면에 보여줄 실시간 상태 ───────── */
export interface SkillLive {
  regionOk: boolean;
  iconState: IconState;
  diff: number;
  lumaRatio: number;
  castAt: number | null;
  expiresAt: number | null;
  lastAlertAt: number | null;
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
}
export interface LiveState {
  now: number;
  skills: Record<string, SkillLive>;
  rune: RuneLive;
  stall: StallLive;
  buffs: Record<string, BuffLive>;
  log: AlertLogEntry[];
}

export const liveStore = createStore<LiveState>({
  now: Date.now(),
  skills: {},
  rune: { status: "off", boxes: [], lastAlertAt: null },
  stall: { status: "off", idleMs: 0, changedCells: 0, totalCells: 0, lastAlertAt: null },
  buffs: {},
  log: [],
});

/** 진단 화면에서 보여줄 마지막 잘라낸 영역 이미지 */
export const debugCrops = new Map<string, ImageData>();

onAlertLog((e) => liveStore.set((s) => ({ ...s, log: [e, ...s.log].slice(0, 30) })));

/* ───────── 알림 실행기 ───────── */
const runners = new Map<string, AlertRunner>();
function runner(key: string, label: string, getCfg: () => AlertConfig) {
  let r = runners.get(key);
  if (!r) {
    r = new AlertRunner(label, getCfg);
    runners.set(key, r);
  }
  r.setLabel(label);
  return r;
}
export function getRunner(key: string) {
  return runners.get(key);
}

/* ───────── 템플릿 캐시 ───────── */
const templateCache = new WeakMap<StoredTemplate, PreparedTemplate>();
function prepared(t: StoredTemplate) {
  let p = templateCache.get(t);
  if (!p) {
    p = prepareTemplate(t);
    templateCache.set(t, p);
  }
  return p;
}

/* ───────── 스킬 ───────── */
interface SkillRuntime {
  detector: QuickslotCastDetector;
  refKey: unknown;
  castAt: number | null;
  expiresAt: number | null;
  alerted: boolean;
}
const skillRt = new Map<string, SkillRuntime>();

function skillRuntime(s: SkillEntry): SkillRuntime {
  let rt = skillRt.get(s.id);
  if (!rt) {
    rt = { detector: new QuickslotCastDetector(), refKey: null, castAt: null, expiresAt: null, alerted: false };
    skillRt.set(s.id, rt);
  }
  if (rt.refKey !== s.readyRef) {
    rt.detector.setReference(s.readyRef);
    rt.refKey = s.readyRef;
  }
  rt.detector.opts = s.options;
  return rt;
}

/** 수동으로 스킬 사용 시점을 지정 (감지 없이 바로 타이머 시작) */
export function manualSkillCast(id: string, at = Date.now()) {
  const s = profileStore.get().skills.find((x) => x.id === id);
  if (!s) return;
  const rt = skillRuntime(s);
  rt.castAt = at;
  rt.expiresAt = at + s.durationSec * 1000;
  rt.alerted = false;
  runners.get(`skill:${id}`)?.reset();
}
export function clearSkill(id: string) {
  const rt = skillRt.get(id);
  if (rt) {
    rt.castAt = null;
    rt.expiresAt = null;
    rt.alerted = false;
  }
  runners.get(`skill:${id}`)?.reset();
}

function tickSkills(p: Profile, now: number, live: boolean) {
  const out: Record<string, SkillLive> = {};
  for (const s of p.skills) {
    const rt = skillRuntime(s);
    const r = runner(`skill:${s.id}`, shortName(s.name), () => profileStore.get().skills.find((x) => x.id === s.id)?.alert ?? s.alert);
    const region = p.regions[`skill:${s.id}`];
    const regionOk = live && regionValidFor(region, screenCapture.width, screenCapture.height);
    if (!s.enabled) {
      r.reset();
      out[s.id] = { regionOk, iconState: "unknown", diff: NaN, lumaRatio: NaN, castAt: null, expiresAt: null, lastAlertAt: r.lastFiredAt };
      continue;
    }
    if (regionOk && region) {
      const img = screenCapture.crop(region);
      if (img) {
        debugCrops.set(`skill:${s.id}`, img);
        const castAt = rt.detector.observe(img, now);
        if (castAt != null) {
          rt.castAt = castAt;
          rt.expiresAt = castAt + s.durationSec * 1000;
          rt.alerted = false;
          r.reset();
        }
      }
    }
    if (rt.expiresAt != null) {
      const remaining = rt.expiresAt - now;
      if (!rt.alerted && remaining <= s.leadSec * 1000) {
        rt.alerted = true;
        r.trigger(now);
      }
      // 종료 후 충분히 지나면 표시 정리
      if (remaining < Math.min(-30000, (s.leadSec - 30) * 1000) && !r.isActive) {
        rt.expiresAt = null;
      }
    }
    r.tick(now);
    const last = rt.detector.last;
    out[s.id] = {
      regionOk,
      iconState: last?.state ?? "unknown",
      diff: last?.diff ?? NaN,
      lumaRatio: last?.lumaRatio ?? NaN,
      castAt: rt.castAt,
      expiresAt: rt.expiresAt,
      lastAlertAt: r.lastFiredAt,
    };
  }
  for (const id of skillRt.keys()) if (!p.skills.some((s) => s.id === id)) skillRt.delete(id);
  return out;
}

/* ───────── 룬 ───────── */
const runeTracker = new RuneTracker();
let runeRegionKey = "";
function tickRune(p: Profile, now: number, live: boolean, prev: RuneLive): RuneLive {
  const r = runner("rune", "룬", () => profileStore.get().rune.alert);
  const base = { boxes: [] as RuneBox[], lastAlertAt: r.lastFiredAt };
  if (!p.rune.enabled) {
    r.reset();
    runeTracker.reset();
    return { ...base, status: "off" };
  }
  if (!live) return { ...base, status: "no-share" };
  const region = p.regions.minimap;
  if (!regionValidFor(region, screenCapture.width, screenCapture.height)) return { ...base, status: "no-region" };
  const key = `${region.x},${region.y},${region.w},${region.h}`;
  if (key !== runeRegionKey) {
    runeRegionKey = key;
    runeTracker.reset();
    r.reset();
  }
  const img = screenCapture.crop(region);
  if (!img) return { ...base, status: "no-region" };
  debugCrops.set("minimap", img);
  const boxes =
    p.rune.mode === "template" && p.rune.template
      ? detectRuneByTemplate(img, prepared(p.rune.template), p.rune.templateMinScore)
      : detectRuneByColor(img, p.rune.color);
  const obs = runeTracker.observe(img, boxes, now);
  if (obs.mapChange || !obs.present) r.reset();
  if (obs.newRune) r.trigger(now);
  const status: RuneLive["status"] = obs.dark ? "dark" : obs.present ? "present" : boxes.length ? "candidate" : "searching";
  void prev;
  return { boxes, status, lastAlertAt: r.lastFiredAt };
}

/* ───────── 사냥 멈춤 ───────── */
const stallMonitor = new ChangeMonitor();
let stallKey = "";
function tickStall(p: Profile, now: number, live: boolean, buffPresent: (id: string) => boolean): StallLive {
  const r = runner("stall", "사냥 멈춤", () => profileStore.get().stall.alert);
  const st = p.stall;
  const base = { idleMs: 0, changedCells: 0, totalCells: 0, lastAlertAt: r.lastFiredAt };
  if (!st.enabled) {
    r.reset();
    stallMonitor.reset();
    return { ...base, status: "off" };
  }
  if (!live) return { ...base, status: "no-share" };
  const region = p.regions.stall;
  if (!regionValidFor(region, screenCapture.width, screenCapture.height)) return { ...base, status: "no-region" };
  if (st.linkedBuffId && !buffPresent(st.linkedBuffId)) {
    r.reset();
    stallMonitor.reset();
    return { ...base, status: "gated" };
  }
  const key = `${st.mode}|${region.x},${region.y},${region.w},${region.h}`;
  if (key !== stallKey) {
    stallKey = key;
    stallMonitor.reset();
    r.reset();
  }
  stallMonitor.opts = st.sensitivity;
  const img = screenCapture.crop(region);
  if (!img) return { ...base, status: "no-region" };
  debugCrops.set("stall", img);
  const sample = stallMonitor.observe(img, now);
  if (sample.changed) r.reset();
  const stalled = stallMonitor.isStalled(now, st.thresholdSec);
  if (stalled) r.trigger(now);
  r.tick(now);
  return {
    status: stalled ? "stalled" : stallMonitor.armed ? "watching" : "waiting",
    idleMs: stallMonitor.idleMs(now),
    changedCells: sample.changedCells,
    totalCells: sample.totalCells,
    lastAlertAt: r.lastFiredAt,
  };
}

/* ───────── 버프칸 감지 ───────── */
interface BuffRuntime {
  presence: PresenceTracker;
  startedAt: number | null;
  endsAt: number | null;
  alerted: boolean;
  spokenSec: number | null;
  score: number;
  colorDist: number;
}
const buffRt = new Map<string, BuffRuntime>();
function buffRuntime(id: string) {
  let rt = buffRt.get(id);
  if (!rt) {
    rt = { presence: new PresenceTracker(2, 2), startedAt: null, endsAt: null, alerted: false, spokenSec: null, score: 0, colorDist: 0 };
    buffRt.set(id, rt);
  }
  return rt;
}
export function isBuffPresent(id: string) {
  return buffRt.get(id)?.presence.present ?? false;
}

function startLinkedTimers(buffId: string, now: number) {
  for (const t of profileStore.get().timers)
    if (t.linkedBuffId === buffId) {
      updateTimer(t.id, { endsAt: now + t.durationSec * 1000, pausedRemainingMs: null });
      runners.get(`timer:${t.id}`)?.reset();
      timerAlerted.delete(t.id);
    }
}

function detectBuffs(p: Profile, now: number, live: boolean) {
  const region = p.regions.buffbar;
  const regionOk = live && regionValidFor(region, screenCapture.width, screenCapture.height);
  let img: ImageData | null = null;
  let gray: ReturnType<typeof toGray> | null = null;
  if (regionOk && region) {
    img = screenCapture.crop(region);
    if (img) {
      debugCrops.set("buffbar", img);
      gray = toGray(img);
    }
  }
  for (const b of p.buffs) {
    const rt = buffRuntime(b.id);
    if (!b.enabled || !b.template || !img || !gray) continue;
    const t = prepared(b.template);
    const m = findTemplate(img, gray, t, 1)[0];
    rt.score = m?.score ?? 0;
    rt.colorDist = m?.colorDist ?? 0;
    const hit = !!m && m.score >= b.minScore && m.colorDist <= 60;
    const ev = rt.presence.observe(hit, now);
    onBuffEvent(b, rt, ev, now);
  }
}

function onBuffEvent(b: BuffEntry, rt: BuffRuntime, ev: "appeared" | "disappeared" | null, now: number) {
  const r = runner(`buff:${b.id}`, b.name, () => profileStore.get().buffs.find((x) => x.id === b.id)?.alert ?? b.alert);
  if (ev === "appeared") {
    if (b.kind === "cooldown") {
      // 쿨타임 진행 중엔 재감지를 무시: 끝나기 4초 전 이후이고, 시작 후 10초가 지나야 새 발동으로 본다.
      // 발동 시점은 처음 본 시각 (확정까지 걸린 시간만큼 앞당김)
      const firstSeen = now - 500;
      const canRestart = rt.endsAt == null || (now >= rt.endsAt - 4000 && now - (rt.startedAt ?? 0) >= 10000);
      if (canRestart) {
        rt.startedAt = firstSeen;
        rt.endsAt = b.durationSec ? firstSeen + b.durationSec * 1000 : null;
        rt.alerted = false;
        rt.spokenSec = null;
        r.reset();
      }
    } else {
      rt.startedAt = now;
      rt.endsAt = b.durationSec ? now + b.durationSec * 1000 : null;
      rt.alerted = false;
      r.reset();
    }
    startLinkedTimers(b.id, now);
  }
  if (ev === "disappeared" && b.kind === "expiry") {
    rt.endsAt = null;
    if (b.alertOnDisappear) {
      r.reset();
      r.trigger(now);
    }
  }
}

function tickBuffTimers(p: Profile, now: number) {
  const out: Record<string, BuffLive> = {};
  const live = screenCapture.state === "live";
  const regionOk = live && regionValidFor(p.regions.buffbar, screenCapture.width, screenCapture.height);
  for (const b of p.buffs) {
    const rt = buffRuntime(b.id);
    const r = runner(`buff:${b.id}`, b.name, () => profileStore.get().buffs.find((x) => x.id === b.id)?.alert ?? b.alert);
    if (!b.enabled) {
      r.reset();
      rt.presence.reset();
      rt.endsAt = null;
    }
    if (b.enabled && rt.endsAt != null) {
      const remaining = rt.endsAt - now;
      if (b.kind === "cooldown" && b.countdownVoice) {
        const sec = Math.ceil(remaining / 1000);
        if (sec >= 1 && sec <= b.leadSec && rt.spokenSec !== sec) {
          rt.spokenSec = sec;
          void audioEngine.play(tts(String(sec)), b.alert.volume);
        }
        if (remaining <= 0 && !rt.alerted) {
          rt.alerted = true;
          r.trigger(now, { jitter: false });
        }
      } else if (!rt.alerted && remaining <= b.leadSec * 1000) {
        rt.alerted = true;
        r.trigger(now);
      }
      if (remaining < -60000) rt.endsAt = null;
    }
    r.tick(now);
    out[b.id] = {
      regionOk,
      present: rt.presence.present,
      score: rt.score,
      colorDist: rt.colorDist,
      endsAt: rt.endsAt,
      lastAlertAt: r.lastFiredAt,
    };
  }
  for (const id of buffRt.keys()) if (!p.buffs.some((b) => b.id === id)) buffRt.delete(id);
  return out;
}

/* ───────── 일반 타이머 ───────── */
const timerAlerted = new Set<string>();
export function resetTimerAlert(id: string) {
  timerAlerted.delete(id);
  runners.get(`timer:${id}`)?.reset();
}
function tickTimers(p: Profile, now: number) {
  for (const t of p.timers) {
    const r = runner(`timer:${t.id}`, shortName(t.name), () => profileStore.get().timers.find((x) => x.id === t.id)?.alert ?? t.alert);
    if (t.endsAt != null) {
      const remaining = t.endsAt - now;
      if (!timerAlerted.has(t.id) && remaining <= t.leadSec * 1000) {
        timerAlerted.add(t.id);
        r.trigger(now);
      }
      if (remaining <= 0 && remaining <= t.leadSec * 1000) {
        if (t.autoRestart) {
          updateTimer(t.id, { endsAt: t.endsAt + t.durationSec * 1000 });
          timerAlerted.delete(t.id);
        } else if (remaining < -1000) {
          updateTimer(t.id, { endsAt: null });
          timerAlerted.delete(t.id);
        }
      }
    }
    r.tick(now);
  }
}

/* ───────── 메인 루프 ───────── */
let lastSlow = 0;
let lastBuff = 0;

function tick(now: number) {
  const p = profileStore.get();
  audioEngine.masterVolume = p.masterVolume;
  randomDelaySetting.enabled = p.randomDelay;
  const live = screenCapture.state === "live" && screenCapture.refresh();
  const prev = liveStore.get();

  const skills = tickSkills(p, now, live);

  if (now - lastBuff >= 500) {
    lastBuff = now;
    detectBuffs(p, now, live);
  }
  const buffs = tickBuffTimers(p, now);

  let rune = prev.rune;
  let stall = prev.stall;
  if (now - lastSlow >= 1000) {
    lastSlow = now;
    rune = tickRune(p, now, live, prev.rune);
    stall = tickStall(p, now, live, isBuffPresent);
  } else {
    runners.get("rune")?.tick(now);
    runners.get("stall")?.tick(now);
  }

  tickTimers(p, now);
  liveStore.set({ now, skills, rune, stall, buffs });
}

let started = false;
export function startEngine() {
  if (started) return;
  started = true;
  appTicker.subscribe(tick);
  appTicker.start();
}
