import { emitAlertLog } from "../alerts/alertRunner";
import { endingText } from "../alerts/speech";
import { screenCapture } from "../capture/screenCapture";
import { regionValidFor } from "../capture/types";
import { readDigits, segment, staticBrightMask, textMask } from "../cv/digits";
import { EstimateConsensus } from "../detect/consensus";
import { CooldownSequenceRecorder, activeTemplates } from "../detect/digitLearner";
import { QuickslotCastDetector, ReferenceHealer, referenceToPixels } from "../detect/quickslotCast";
import { profileStore, shortName, updateSkill, type Profile, type SkillEntry } from "../state/profile";
import { debugCrops, type SkillLive } from "./live";
import { frameTime, learnFrom, runner, runners } from "./shared";

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
  /** 감지를 쉬었다가 다시 보는 중: 그 사이 다시 쓴 스킬이면 숫자로 사용 시각을 다시 맞춘다 */
  resync: boolean;
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
      resync: false,
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

export function tickSkills(p: Profile, now: number, live: boolean) {
  const out: Record<string, SkillLive> = {};
  for (const s of p.skills) {
    const rt = skillRuntime(s);
    const r = runner(
      `skill:${s.id}`,
      shortName(s.name),
      () => profileStore.get().skills.find((x) => x.id === s.id)?.alert ?? s.alert,
      () => endingText(shortName(s.name), rt.expiresAt),
    );
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
          rt.resync = false;
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
        } else if (now - rt.digitsAbsentSince >= 1500) {
          rt.resync = false; // 스킬이 준비됨: 다음 사용은 평소처럼 잡힌다
        }

        const trusted = read && read.seconds >= 2;
        // 지금 보이는 쿨타임이 알고 있던 사용의 쿨타임일 수 없음 (이전 쿨타임이 이미 끝났어야 함)
        const unknownCast = rt.castAt == null || (rt.resync && now - rt.castAt >= s.cooldownSec * 1000 - 1000);
        if (trusted && rt.cycleStart != null && !rt.cycleUsed && now - rt.cycleStart <= 3000) {
          // 숫자가 실제로 읽혀야 진짜 쿨타임 시작으로 인정 (아이콘 그림의 밝은 부분 오인 방지)
          rt.cycleUsed = true;
          if (rt.castAt == null || rt.cycleStart - rt.castAt > 3000) startCycle(rt.cycleStart);
        } else if (trusted && unknownCast && rt.cycleStart == null && read.seconds <= s.cooldownSec + 1) {
          // 앱을 쿨타임 도중에 켰거나, 공유가 끊긴 사이 스킬을 쓴 경우:
          // 설정한 쿨타임으로 사용 시각을 거꾸로 추정 (3번 일치해야 인정. 시각은 그 화면이 찍힌 때 기준)
          const agreed = rt.readCasts.add(frameTime(now) - (s.cooldownSec - read.seconds) * 1000 - 500);
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

/** 화면 전환이 시작되면: 어두워진 아이콘을 '스킬 사용'으로 보지 않게 */
export function interruptSkillWatch() {
  for (const rt of skillRt.values()) rt.detector.interrupt();
}

/** 감지를 쉬었다가(화면 전환·공유 끊김) 다시 볼 때: 그 사이 바뀐 아이콘을 '방금 사용'으로 보지 않고 숫자로 다시 맞춘다 */
export function resumeSkillWatch() {
  for (const rt of skillRt.values()) {
    rt.detector.interrupt();
    rt.digitsAbsentSince = null;
    rt.cycleStart = null;
    rt.readCasts.reset();
    rt.resync = true;
  }
}
