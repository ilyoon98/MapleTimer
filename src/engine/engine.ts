import {
  AlertRunner,
  emitAlertLog,
  onAlertLog,
  randomDelaySetting,
  type AlertConfig,
  type AlertLogEntry,
} from "../alerts/alertRunner";
import { audioEngine } from "../alerts/audio";
import { screenCapture } from "../capture/screenCapture";
import { regionValidFor } from "../capture/types";
import { cropPixels, toGray, type Pixels } from "../cv/image";
import { findTemplate, prepareTemplate, type PreparedTemplate, type StoredTemplate } from "../cv/match";
import { ChangeMonitor } from "../detect/changeMonitor";
import { EstimateConsensus, applyExpiry } from "../detect/consensus";
import { PresenceTracker } from "../detect/presence";
import { QuickslotCastDetector, ReferenceHealer, referenceToPixels, type IconState } from "../detect/quickslotCast";
import { RuneTracker, detectRuneByColor, detectRuneByTemplate, type RuneBox } from "../detect/rune";
import { appTicker } from "../core/ticker";
import { readDigits, segment, staticBrightMask, textMask } from "../cv/digits";
import {
  CooldownSequenceRecorder,
  activeTemplates,
  addDigitSamples,
  learnedDigitCount,
  type LearnResult,
} from "../detect/digitLearner";
import { createStore } from "../state/createStore";
import { profileStore, shortName, updateSkill, updateTimer, type BuffEntry, type Profile, type SkillEntry } from "../state/profile";
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
  perf: { avgMs: 0, maxMs: 0 },
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
  recorder: CooldownSequenceRecorder;
  /** 숫자로 거꾸로 계산한 사용 시각 후보들 (최근 몇 개가 서로 맞아야 믿는다) */
  readCasts: EstimateConsensus;
  digitText: string | null;
  digitConf: number;
  /** 숫자가 안 보이기 시작한 시각 (null = 보이는 중이거나 아직 모름) */
  digitsAbsentSince: number | null;
  /** 이번 쿨타임 숫자가 처음 나타난 시각 */
  cycleStart: number | null;
  cycleUsed: boolean;
  staticKey: unknown;
  staticMask: Uint8Array | null;
  /** 기준 이미지에 숫자가 찍혀 있음 (쿨타임 중에 저장한 듯) */
  refSuspicious: boolean;
  suspKey: unknown;
  healer: ReferenceHealer;
}
const skillRt = new Map<string, SkillRuntime>();

function skillRuntime(s: SkillEntry): SkillRuntime {
  let rt = skillRt.get(s.id);
  if (!rt) {
    rt = {
      detector: new QuickslotCastDetector(),
      refKey: null,
      castAt: null,
      expiresAt: null,
      alerted: false,
      recorder: new CooldownSequenceRecorder(),
      readCasts: new EstimateConsensus(1500),
      digitText: null,
      digitConf: 0,
      digitsAbsentSince: null,
      cycleStart: null,
      cycleUsed: true,
      staticKey: undefined,
      staticMask: null,
      refSuspicious: false,
      suspKey: undefined,
      healer: new ReferenceHealer(),
    };
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
      out[s.id] = {
        regionOk,
        iconState: "unknown",
        diff: NaN,
        lumaRatio: NaN,
        castAt: null,
        expiresAt: null,
        lastAlertAt: r.lastFiredAt,
        digitText: null,
        digitConf: 0,
        learning: false,
        learnObserved: 0,
        learnMessage: null,
      };
      continue;
    }
    if (regionOk && region) {
      const img = screenCapture.crop(region);
      if (img) {
        debugCrops.set(`skill:${s.id}`, img);
        const startCycle = (castAt: number) => {
          rt.castAt = castAt;
          rt.expiresAt = castAt + s.durationSec * 1000;
          rt.alerted = false;
          r.reset();
        };
        // 기준 이미지(사용 가능 상태)에도 있는 밝은 글자(키 이름 등)는 쿨타임 숫자가 아니다
        if (rt.staticKey !== s.readyRef) {
          rt.staticKey = s.readyRef;
          rt.staticMask = s.readyRef ? staticBrightMask(s.readyRef.data, s.readyRef.width, s.readyRef.height) : null;
        }
        const seg = segment(img, undefined, rt.staticMask);
        const castAt = rt.detector.observe(img, now, textMask(img));
        if (castAt != null) startCycle(castAt);

        // 기준 이미지에 숫자가 찍혀 있으면(쿨타임 중에 저장) 준비된 모습이 보일 때 스스로 다시 맞춘다
        if (rt.suspKey !== s.readyRef) {
          rt.suspKey = s.readyRef;
          rt.refSuspicious = !!s.readyRef && segment(referenceToPixels(s.readyRef)).glyphs.length > 0;
          rt.healer.reset();
        }
        const healed = rt.healer.observe({
          suspicious: rt.refSuspicious,
          img,
          hasDigits: seg.glyphs.length > 0,
          lumaRatio: rt.detector.last?.lumaRatio ?? NaN,
          now,
        });
        if (healed) {
          updateSkill(s.id, { readyRef: healed });
          emitAlertLog(`기준 이미지 자동 교체 (${shortName(s.name)}): 쿨타임 숫자가 찍힌 기준을 준비된 모습으로 바꿨어요`, now);
        }

        // 쿨타임 숫자: 학습 + 읽기
        const learned = rt.recorder.feed(seg, now);
        if (learned) learnFrom(learned, shortName(s.name), now);
        const read = readDigits(seg, activeTemplates());
        rt.digitText = read?.text ?? null;
        rt.digitConf = read?.confidence ?? 0;

        // 숫자가 (1.5초 넘게 없다가) 새로 나타난 순간 = 쿨타임 시작 = 스킬 사용
        if (seg.glyphs.length) {
          if (rt.digitsAbsentSince != null && now - rt.digitsAbsentSince >= 1500) {
            rt.cycleStart = now;
            rt.cycleUsed = false;
          }
          rt.digitsAbsentSince = null;
        } else if (rt.digitsAbsentSince == null) {
          rt.digitsAbsentSince = now;
        }

        const trusted = read && learnedDigitCount() === 10 && read.seconds >= 2;
        if (trusted && rt.cycleStart != null && !rt.cycleUsed && now - rt.cycleStart <= 3000) {
          // 숫자가 실제로 읽혀야 진짜 쿨타임 시작으로 인정 (아이콘 그림의 밝은 부분 오인 방지)
          rt.cycleUsed = true;
          if (rt.castAt == null || rt.cycleStart - rt.castAt > 3000) startCycle(rt.cycleStart);
        } else if (trusted && rt.castAt == null && rt.cycleStart == null && read.seconds <= s.cooldownSec + 1) {
          // 앱을 쿨타임 도중에 켠 경우: 설정한 쿨타임으로 사용 시각을 거꾸로 추정 (3번 일치해야 인정)
          const agreed = rt.readCasts.add(now - (s.cooldownSec - read.seconds) * 1000 - 500);
          if (agreed != null) startCycle(agreed);
        } else if (!read) {
          rt.readCasts.reset();
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
      if (remaining < Math.min(-30000, (s.leadSec - 30) * 1000) && !r.isRinging) {
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
      digitText: rt.digitText,
      digitConf: rt.digitConf,
      learning: rt.recorder.status === "recording",
      learnObserved: rt.recorder.observedValues,
      learnMessage: rt.recorder.lastResult?.reason ?? null,
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
  readText: string | null;
  readEsts: EstimateConsensus;
  /** 버프칸 안에서 마지막으로 찾은 아이콘 위치 (버프칸 영역 기준) */
  lastPos: { x: number; y: number } | null;
  /** 버프가 끝날 때까지 숫자를 지켜보며 학습 */
  recorder: CooldownSequenceRecorder;
}
const buffRt = new Map<string, BuffRuntime>();
function buffRuntime(id: string) {
  let rt = buffRt.get(id);
  if (!rt) {
    rt = {
      presence: new PresenceTracker(2, 2),
      startedAt: null,
      endsAt: null,
      alerted: false,
      spokenSec: null,
      score: 0,
      colorDist: 0,
      readText: null,
      readEsts: new EstimateConsensus(2000),
      lastPos: null,
      recorder: new CooldownSequenceRecorder(90, false),
    };
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
      if (t.pauseWithoutBuff && t.pausedRemainingMs != null && t.pausedRemainingMs > 0) {
        // 일시정지돼 있던 타이머는 이어서 진행
        updateTimer(t.id, { endsAt: now + t.pausedRemainingMs, pausedRemainingMs: null });
        continue;
      }
      updateTimer(t.id, { endsAt: now + t.durationSec * 1000, pausedRemainingMs: null });
      runners.get(`timer:${t.id}`)?.reset();
      timerAlerted.delete(t.id);
    }
}

function pauseLinkedTimers(buffId: string, now: number) {
  for (const t of profileStore.get().timers)
    if (t.linkedBuffId === buffId && t.pauseWithoutBuff && t.endsAt != null && t.endsAt > now)
      updateTimer(t.id, { endsAt: null, pausedRemainingMs: t.endsAt - now });
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
    if (hit && m) rt.lastPos = { x: m.x, y: m.y };
    const ev = rt.presence.observe(hit, now);
    onBuffEvent(b, rt, ev, now);
    if (!hit) rt.readText = null;
  }
}

function learnFrom(res: LearnResult, name: string, now: number) {
  if (res.ok) addDigitSamples(res.samples);
  // 값을 몇 개 못 본 실패는 잠깐 스친 잡음이므로 기록하지 않는다
  if (res.ok || res.observed >= 5) emitAlertLog(`숫자 학습 ${res.ok ? "완료" : "실패"} (${name}): ${res.reason}`, now);
}

/**
 * 남은 시간을 읽는 버프는 매 tick(0.25초) 마지막 위치 주변만 다시 찾아 숫자를 읽는다.
 * (버프칸 전체 탐색은 0.5초마다, 이건 작은 창이라 가볍다)
 */
function trackBuffIcons(p: Profile, now: number, live: boolean) {
  const region = p.regions.buffbar;
  if (!live || !regionValidFor(region, screenCapture.width, screenCapture.height)) return;
  for (const b of p.buffs) {
    if (!b.enabled || !b.template || !b.readTime || b.kind !== "expiry") continue;
    const rt = buffRuntime(b.id);
    if (!rt.presence.present || !rt.lastPos) continue;
    const t = prepared(b.template);
    const pad = 4;
    const wx = Math.max(0, region.x + rt.lastPos.x - pad);
    const wy = Math.max(0, region.y + rt.lastPos.y - pad);
    const img = screenCapture.crop({ x: wx, y: wy, w: t.gray.width + pad * 2, h: t.gray.height + pad * 2 });
    if (!img) continue;
    const m = findTemplate(img, toGray(img), t, 1)[0];
    if (!m || m.score < b.minScore || m.colorDist > 60) continue;
    rt.lastPos = { x: wx + m.x - region.x, y: wy + m.y - region.y };
    const icon = cropPixels(img, m.x, m.y, t.gray.width, t.gray.height);
    debugCrops.set(`buff:${b.id}`, new ImageData(new Uint8ClampedArray(icon.data), icon.width, icon.height));
    const seg = segment(icon);
    readBuffTime(b, rt, icon, now, seg);
    const res = rt.recorder.feed(seg, now);
    if (res) learnFrom(res, b.name, now);
  }
}

/**
 * 버프 아이콘 위의 남은 시간 숫자를 읽어 종료 시각을 맞춘다 (정밀 감지).
 * 3번 연달아 서로 2초 안으로 맞아야 믿고, 더 늦은 종료 시각이 확인되면(재사용·자석펫 연장) 새 주기로 본다.
 */
function readBuffTime(b: BuffEntry, rt: BuffRuntime, icon: Pixels, now: number, seg = segment(icon)) {
  const read = readDigits(seg, activeTemplates());
  rt.readText = read?.text ?? null;
  if (!read || read.seconds < 1 || (learnedDigitCount() < 10 && read.confidence < 0.9)) {
    rt.readEsts.reset();
    return;
  }
  const agreed = rt.readEsts.add(now + read.seconds * 1000 + 500);
  if (agreed == null) return;
  const { endsAt, change } = applyExpiry(rt.endsAt, agreed, 2500);
  if (change === "new" || change === "extended") {
    rt.alerted = false;
    runners.get(`buff:${b.id}`)?.reset();
  }
  rt.endsAt = endsAt;
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
    // 버프가 끝난 순간: 마지막으로 보인 숫자가 1 이므로 지금까지의 순서로 숫자 학습
    const res = rt.recorder.finishNow();
    if (res && b.readTime) learnFrom(res, b.name, now);
    rt.readEsts.reset();
    rt.endsAt = null;
    pauseLinkedTimers(b.id, now);
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
        // 다른 버프 종료 알림이 15초 안에 이미 울렸으면 한 번으로 합친다 (유니온 부·행운을 같이 쓴 경우 등)
        const merged = p.buffs.some((o) => {
          if (o.id === b.id || o.kind !== "expiry") return false;
          const f = runners.get(`buff:${o.id}`)?.lastFiredAt;
          return f != null && now - f <= 15_000;
        });
        if (!merged) r.trigger(now);
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
      readText: rt.readText,
    };
  }
  for (const id of buffRt.keys()) if (!p.buffs.some((b) => b.id === id)) buffRt.delete(id);
  return out;
}

/* ───────── 부스터 종료 ───────── */
interface BoosterRuntime {
  ests: EstimateConsensus;
  endsAt: number | null;
  alerted: boolean;
  lastReadAt: number;
  readText: string | null;
}
const boosterRt: BoosterRuntime = { ests: new EstimateConsensus(1500), endsAt: null, alerted: false, lastReadAt: 0, readText: null };

/** 부스터 진단 화면의 '직접 가르치기'용: 마지막으로 나눈 글자 */
export let lastBoosterSegment: ReturnType<typeof segment> | null = null;

/**
 * 화면 위쪽 부스터 타이머 숫자("45.23" 또는 "1:05")를 읽어 끝나기 전에 알린다.
 * 3번 연달아 1.5초 안으로 맞아야 믿고, 더 늦은 종료 시각이 확인되면(재사용) 새 주기로 본다.
 */
function tickBooster(p: Profile, now: number, live: boolean): BoosterLive {
  const r = runner("booster", "부스터", () => profileStore.get().booster.alert);
  const b = p.booster;
  const rt = boosterRt;
  const base = { readText: null, lastAlertAt: r.lastFiredAt };
  if (!b.enabled) {
    r.reset();
    rt.endsAt = null;
    return { ...base, status: "off", endsAt: null };
  }
  if (!live) return { ...base, status: "no-share", endsAt: rt.endsAt };
  const region = p.regions.booster;
  if (!regionValidFor(region, screenCapture.width, screenCapture.height)) return { ...base, status: "no-region", endsAt: null };
  const img = screenCapture.crop(region);
  if (img) {
    debugCrops.set("booster", img);
    const seg = segment(img);
    lastBoosterSegment = seg;
    const read = readDigits(seg, activeTemplates());
    rt.readText = read?.text ?? null;
    if (read && read.seconds > 0 && read.seconds < 3600) {
      rt.lastReadAt = now;
      const agreed = rt.ests.add(now + read.seconds * 1000);
      if (agreed != null) {
        if (rt.endsAt == null || agreed - rt.endsAt > 5000) {
          // 새로 확인한 주기: 이미 알림 시점이 지났으면 이번 주기는 조용히 넘긴다
          rt.endsAt = agreed;
          rt.alerted = agreed - now <= b.leadSec * 1000;
          r.reset();
        } else if (Math.abs(agreed - rt.endsAt) <= 1500) {
          rt.endsAt = (rt.endsAt + agreed) / 2;
        }
      }
    } else if (!read) {
      rt.ests.reset();
    }
  }
  // 20초 넘게 못 읽으면 부스터가 끝났거나 사라진 것으로 본다
  if (rt.endsAt != null && now - rt.lastReadAt > 20_000 && now > rt.endsAt) rt.endsAt = null;
  if (rt.endsAt != null && !rt.alerted && rt.endsAt - now <= b.leadSec * 1000) {
    rt.alerted = true;
    r.trigger(now);
  }
  r.tick(now);
  const status: BoosterLive["status"] = rt.endsAt != null ? "running" : rt.readText ? "reading" : "searching";
  return { readText: rt.readText, lastAlertAt: r.lastFiredAt, status, endsAt: rt.endsAt };
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
          const delay = Math.max(0, t.autoRestartDelaySec ?? 0) * 1000;
          updateTimer(t.id, { endsAt: t.endsAt + delay + t.durationSec * 1000 });
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

/** 지금 울리거나 반복 중인 알림을 모두 멈춘다 */
export function stopRingingAlerts() {
  for (const r of runners.values()) r.ack();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

/* ───────── 메인 루프 ───────── */
let lastSlow = 0;
let lastBuff = 0;
let prevCaptureState = screenCapture.state;
let lastBlackCheck = 0;
let blackSince: number | null = null;

function checkShareEnded(p: Profile, now: number) {
  const st = screenCapture.state;
  if (prevCaptureState === "live" && st === "ended" && p.alertOnShareEnd) {
    emitAlertLog("화면 공유 끊김", now);
    void audioEngine.play(tts("화면 공유가 끊겼어요"), 1);
  }
  prevCaptureState = st;
}

let perfAvg = 0;
let perfMax = 0;
let perfMaxAt = 0;

function tick(now: number) {
  const t0 = performance.now();
  tickInner(now);
  const ms = performance.now() - t0;
  perfAvg = perfAvg ? perfAvg * 0.95 + ms * 0.05 : ms;
  // 최근 10초 안의 최대값
  if (ms > perfMax || now - perfMaxAt > 10_000) {
    perfMax = ms;
    perfMaxAt = now;
  }
  const prev = liveStore.get().perf;
  if (Math.abs(prev.avgMs - perfAvg) > 0.5 || prev.maxMs !== perfMax) liveStore.set({ perf: { avgMs: perfAvg, maxMs: perfMax } });
}

function tickInner(now: number) {
  const p = profileStore.get();
  audioEngine.masterVolume = p.masterVolume;
  audioEngine.muted = p.muted;
  audioEngine.ttsVoiceURI = p.ttsVoice;
  audioEngine.ttsRate = p.ttsRate;
  randomDelaySetting.enabled = p.randomDelay;
  checkShareEnded(p, now);
  const live = screenCapture.state === "live" && screenCapture.refresh();
  const prev = liveStore.get();

  const skills = tickSkills(p, now, live);

  let booster = prev.booster;
  if (now - lastBuff >= 500) {
    lastBuff = now;
    detectBuffs(p, now, live);
    booster = tickBooster(p, now, live);
  } else {
    runners.get("booster")?.tick(now);
  }
  trackBuffIcons(p, now, live);
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
  let ringing: string[] = [];
  for (const [key, r] of runners) if (r.isRinging) ringing.push(runnerLabel(key, p));
  if (ringing.join("|") === prev.ringing.join("|")) ringing = prev.ringing; // 바뀐 게 없으면 같은 배열 유지 (불필요한 다시 그리기 방지)
  // 게임 화면은 늘 조금씩 움직이므로 10초 넘게 새 프레임이 없으면 멈춘 것으로 본다
  const lf = screenCapture.lastFrameAt;
  const captureStale = screenCapture.state === "live" && lf != null && now - lf > 10_000;
  // 2초마다 화면 전체 밝기를 보고, 4초 넘게 거의 새까맣고 무늬도 없으면 검은 화면으로 본다
  if (live && now - lastBlackCheck >= 2000) {
    lastBlackCheck = now;
    const st = screenCapture.frameStats();
    const black = !!st && st.mean < 4 && st.spread < 12;
    blackSince = black ? (blackSince ?? now) : null;
  } else if (!live) blackSince = null;
  const captureBlack = blackSince != null && now - blackSince >= 4000;
  liveStore.set({ now, skills, rune, stall, buffs, booster, ringing, captureStale, captureBlack });
}

function runnerLabel(key: string, p: Profile) {
  const [kind, id] = key.split(":");
  if (kind === "skill") return shortName(p.skills.find((s) => s.id === id)?.name ?? "스킬");
  if (kind === "buff") return p.buffs.find((b) => b.id === id)?.name ?? "버프";
  if (kind === "timer") return shortName(p.timers.find((t) => t.id === id)?.name ?? "타이머");
  return kind === "rune" ? "룬" : kind === "stall" ? "사냥 멈춤" : kind === "booster" ? "부스터" : kind;
}

// 개발 모드에서만: 브라우저 콘솔에서 감지 상태를 들여다보기 위한 손잡이
if (import.meta.env.DEV) Object.assign(window, { __mapleTimer: { debugCrops, liveStore, profileStore, screenCapture } });

let started = false;
export function startEngine() {
  if (started) return;
  started = true;
  appTicker.subscribe(tick);
  appTicker.start();
}

// 개발 서버에서 엔진이나 감지 코드가 바뀌면(HMR) 페이지를 새로 고친다.
// 그대로 두면 옛 엔진은 보이지 않게 계속 돌고 화면은 새 (멈춘) 엔진을 보여주는 엉킨 상태가 된다.
// 새로 고친 뒤에는 준비 체크리스트에 '화면 공유 시작'이 다시 보인다.
if (import.meta.hot) import.meta.hot.accept(() => location.reload());
