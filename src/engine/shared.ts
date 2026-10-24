import { AlertRunner, emitAlertLog, type AlertConfig } from "../alerts/alertRunner";
import { screenCapture } from "../capture/screenCapture";
import { prepareTemplate, scaleTemplate, type PreparedTemplate, type StoredTemplate } from "../cv/match";
import { addDigitSamples, type LearnResult } from "../detect/digitLearner";
import { shortName, type Profile } from "../state/profile";

/* ───────── 알림 실행기 ───────── */
export const runners = new Map<string, AlertRunner>();

/** speak: 음성 읽기일 때 읽을 문장 (항목 이름·상황으로 알아서 만든다) */
export function runner(key: string, label: string, getCfg: () => AlertConfig, speak: () => string) {
  let r = runners.get(key);
  if (!r) {
    r = new AlertRunner(label, getCfg);
    runners.set(key, r);
  }
  r.setLabel(label);
  r.setSpeak(speak);
  return r;
}

export function getRunner(key: string) {
  return runners.get(key);
}

/**
 * 지금 분석 중인 화면이 찍힌 시각. 숫자로 계산하는 종료·사용 시각은 이걸 기준으로 한다.
 * (게임 창을 내려서 화면이 멈추면 같은 숫자를 계속 읽는데, 지금 시각 기준이면 종료 시각이 계속 늦춰진다)
 */
export function frameTime(now: number) {
  return screenCapture.drawnAt ?? now;
}

/* ───────── 템플릿 캐시 ───────── */
const templateCache = new WeakMap<StoredTemplate, PreparedTemplate>();

export function prepared(t: StoredTemplate) {
  let p = templateCache.get(t);
  if (!p) {
    p = prepareTemplate(t);
    templateCache.set(t, p);
  }
  return p;
}

/** 프로그램에 넣어 둔 게임 아이콘은 칸마다 크기가 조금 달라서 크기를 바꾼 몇 가지로 비교한다 */
const ICON_SCALES = [0.92, 1, 1.08];
const scaledCache = new WeakMap<StoredTemplate, PreparedTemplate[]>();
export function preparedScales(t: StoredTemplate): PreparedTemplate[] {
  let list = scaledCache.get(t);
  if (!list) {
    list = ICON_SCALES.map((s) => prepareTemplate(s === 1 ? t : scaleTemplate(t, s)));
    scaledCache.set(t, list);
  }
  return list;
}

/** 학습 결과를 저장하고 기록에 남긴다 */
export function learnFrom(res: LearnResult, name: string, now: number) {
  if (res.ok) addDigitSamples(res.samples);
  // 값을 몇 개 못 본 실패는 잠깐 스친 잡음이므로 기록하지 않는다
  if (res.ok || res.observed >= 5) emitAlertLog(`숫자 학습 ${res.ok ? "완료" : "실패"} (${name}): ${res.reason}`, now);
}

/** 지운 스킬·버프·타이머의 알림이 '울리는 중'으로 계속 남지 않게 정리 */
export function pruneRunners(p: Profile) {
  for (const [key, r] of runners) {
    const [kind, id] = key.split(":");
    const list = kind === "skill" ? p.skills : kind === "buff" ? p.buffs : kind === "timer" ? p.timers : null;
    if (id == null || !list || list.some((x) => x.id === id)) continue;
    r.reset();
    runners.delete(key);
  }
}

/** 지금 울리거나 반복 중인 알림을 모두 멈춘다 */
export function stopRingingAlerts() {
  for (const r of runners.values()) r.ack();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

/** '울리는 중' 목록에 보여 줄 이름 */
export function runnerLabel(key: string, p: Profile) {
  const [kind, id] = key.split(":");
  if (kind === "skill") return shortName(p.skills.find((s) => s.id === id)?.name ?? "스킬");
  if (kind === "buff") return p.buffs.find((b) => b.id === id)?.name ?? "버프";
  if (kind === "timer") return shortName(p.timers.find((t) => t.id === id)?.name ?? "타이머");
  return kind === "rune" ? "룬" : kind === "stall" ? "사냥 멈춤" : kind === "booster" ? "부스터" : kind;
}
