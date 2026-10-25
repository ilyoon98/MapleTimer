/**
 * 감지 엔진: 250ms 마다 화면을 보고 기능별 감지·알림을 돌린다.
 * 기능별 코드는 skills / buffs / booster / runeStall / timers 에 있고, 여기는 메인 루프와 바깥에 내보내는 이름만.
 */
import { emitAlertLog, randomDelaySetting } from "../alerts/alertRunner";
import { audioEngine } from "../alerts/audio";
import { screenCapture } from "../capture/screenCapture";
import { appTicker } from "../core/ticker";
import { ScreenTransitionDetector } from "../detect/screenTransition";
import { preciseIcon, profileStore, tts, type Profile } from "../state/profile";
import { detectBuffs, isBuffPresent, preciseBuffId, preciseSkillBuffs, tickBuffTimers, trackBuffIcons } from "./buffs";
import { tickBooster } from "./booster";
import { recordClip } from "./clip";
import { debugCrops, liveStore } from "./live";
import { tickRune, tickStall } from "./runeStall";
import { pruneRunners, runnerLabel, runners } from "./shared";
import { interruptSkillWatch, resumeSkillWatch, tickSkills } from "./skills";
import { tickTimers } from "./timers";

export * from "./live";
export { getRunner, stopRingingAlerts } from "./shared";
export { clearSkill, manualSkillCast } from "./skills";
export { isBuffPresent } from "./buffs";
export { lastBoosterSegment } from "./booster";
export { resetTimerAlert } from "./timers";
export { clipSnapshot, type ClipData } from "./clip";

/* ───────── 메인 루프 ───────── */
let lastSlow = 0;
let lastBuff = 0;
let prevCaptureState = screenCapture.state;
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

let lastTickAt = 0;

function tick(now: number) {
  // 확인이 10초 넘게 끊겼다가 다시 돌면 기록 (크롬이 탭을 멈추는 설정 등). 다음에 원인을 바로 알 수 있게
  if (lastTickAt && now - lastTickAt > 10_000 && screenCapture.state === "live")
    emitAlertLog(`감지가 ${Math.round((now - lastTickAt) / 1000)}초 멈췄어요 (크롬이 탭을 멈췄을 수 있어요)`, now);
  lastTickAt = now;
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
  const stats = live ? screenCapture.frameStats() : null;
  recordClip(p, now, live, stats?.mean ?? null);

  // 화면 전환 중(맵 이동·로딩으로 화면 전체가 어두워짐)에는 퀵슬롯·버프칸·부스터를 보지 않는다.
  // 실제 게임에서 화면이 어두워질 때 모든 퀵슬롯이 '스킬 사용'으로, 버프가 '사라짐'으로 잘못 잡혔다.
  const transition = screenTransition.update(stats, now);
  if (transition && !wasTransition) interruptSkillWatch();
  wasTransition = transition;
  const watch = live && !transition;
  if (watch && !wasWatching) resumeSkillWatch();
  wasWatching = watch;

  const skills = tickSkills(p, now, watch);
  // (정밀) 스킬은 버프 아이콘으로 본다: 버프칸 감지 항목에 붙여서 같이 돌린다
  const pb: Profile = { ...p, buffs: [...p.buffs, ...preciseSkillBuffs(p, screenCapture.width, screenCapture.height)] };

  let booster = prev.booster;
  if (now - lastBuff >= 500) {
    lastBuff = now;
    detectBuffs(pb, now, watch);
    if (!transition) booster = tickBooster(p, now, live);
    else runners.get("booster")?.tick(now);
  } else {
    runners.get("booster")?.tick(now);
  }
  trackBuffIcons(pb, now, watch);
  const buffs = tickBuffTimers(pb, now);
  for (const s of p.skills) {
    const b = preciseIcon(s) ? buffs[preciseBuffId(s.id)] : undefined;
    if (!b) continue;
    skills[s.id] = {
      regionOk: b.regionOk,
      iconState: b.present ? "ready" : "unknown",
      diff: NaN,
      lumaRatio: NaN,
      castAt: null,
      expiresAt: b.endsAt,
      lastAlertAt: b.lastAlertAt,
      digitText: b.readText,
      digitConf: b.score,
      learning: false,
      learnObserved: 0,
      learnMessage: null,
    };
  }

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
  pruneRunners(p);
  let ringing: string[] = [];
  for (const [key, r] of runners) if (r.isRinging) ringing.push(runnerLabel(key, p));
  if (ringing.join("|") === prev.ringing.join("|")) ringing = prev.ringing; // 바뀐 게 없으면 같은 배열 유지 (불필요한 다시 그리기 방지)
  // 게임 화면은 늘 조금씩 움직이므로 10초 넘게 새 프레임이 없으면 멈춘 것으로 본다
  const lf = screenCapture.lastFrameAt;
  const captureStale = screenCapture.state === "live" && lf != null && now - lf > 10_000;
  // 4초 넘게 거의 새까맣고 무늬도 없으면 (맵 이동의 짧은 암전이 아니라) 공유 자체가 검은 화면
  if (live && stats) {
    const black = stats.mean < 4 && stats.spread < 12;
    blackSince = black ? (blackSince ?? now) : null;
  } else if (!live) blackSince = null;
  const captureBlack = blackSince != null && now - blackSince >= 4000;
  liveStore.set({ now, skills, rune, stall, buffs, booster, ringing, captureStale, captureBlack, screenTransition: transition });
}

const screenTransition = new ScreenTransitionDetector();
let wasTransition = false;
let wasWatching = false;

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
