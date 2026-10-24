import { audioEngine } from "../alerts/audio";
import { endingText } from "../alerts/speech";
import { screenCapture } from "../capture/screenCapture";
import { regionValidFor } from "../capture/types";
import { readDigits, segment } from "../cv/digits";
import { cropPixels, toGray, type Pixels } from "../cv/image";
import { findTemplate, type PreparedTemplate } from "../cv/match";
import { gameIcon } from "../cv/gameIcons";
import { EstimateConsensus, applyExpiry, keepEndAfterVanish } from "../detect/consensus";
import { CooldownSequenceRecorder, activeTemplates } from "../detect/digitLearner";
import { PresenceTracker } from "../detect/presence";
import type { SavedRegion } from "../capture/types";
import { profileStore, tts, type BuffEntry, type Profile } from "../state/profile";
import { debugCrops, type BuffLive } from "./live";
import { frameTime, learnFrom, prepared, preparedScales, runner, runners } from "./shared";
import { pauseLinkedTimers, startLinkedTimers } from "./timers";

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
  /** 남은 시간 숫자를 마지막으로 읽은 시각 */
  lastReadAt: number;
  readEsts: EstimateConsensus;
  /** 마지막으로 찾은 아이콘의 템플릿 번호 (게임 아이콘은 크기별로 여러 개) */
  tplIdx: number;
  /** 마지막으로 찾은 아이콘 위치 (화면 기준) */
  lastPos: { x: number; y: number } | null;
  /** 마지막 위치 주변에서 아이콘을 다시 찾은 시각 (이때는 버프칸 전체를 다시 훑지 않는다) */
  localHitAt: number;
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
      lastReadAt: 0,
      readEsts: new EstimateConsensus(2000),
      tplIdx: 0,
      lastPos: null,
      localHitAt: 0,
      recorder: new CooldownSequenceRecorder(90, false),
    };
    buffRt.set(id, rt);
  }
  return rt;
}
export function isBuffPresent(id: string) {
  return buffRt.get(id)?.presence.present ?? false;
}

/**
 * 일치 기준. 정한 자리는 그 칸만 보므로 다른 아이콘과 헷갈릴 일이 적어 0.85 까지 받아 준다
 * (실제 게임: 즐겨찾기 칸의 야누스가 0.90~0.92, 끝나기 직전 깜빡일 때 0.87)
 */
function minScoreOf(b: BuffEntry): number {
  // 프로그램에 넣어 둔 게임 아이콘: 실제 화면에서 야누스 0.79~0.83(숫자 빼고 비교), 다른 아이콘은 0.60 이하
  if (b.icon) return 0.72;
  return b.slot ? Math.min(b.minScore, 0.85) : b.minScore;
}

/** 비교할 아이콘: 프로그램에 넣어 둔 게임 아이콘(크기 몇 가지) 또는 사용자가 등록한 아이콘 */
function templatesOf(b: BuffEntry): PreparedTemplate[] {
  if (b.icon) return preparedScales(gameIcon(b.icon));
  return b.template ? [prepared(b.template)] : [];
}

/** 이 버프를 찾을 영역: 정한 자리(버프 즐겨찾기 칸)가 있으면 그 자리만, 없으면 위쪽 버프칸 */
export function buffRegion(p: Profile, b: BuffEntry): SavedRegion | undefined {
  return b.slot ?? p.regions.buffbar;
}

export function buffRegionOk(p: Profile, b: BuffEntry): boolean {
  return screenCapture.state === "live" && regionValidFor(buffRegion(p, b), screenCapture.width, screenCapture.height);
}

export function detectBuffs(p: Profile, now: number, live: boolean) {
  // 영역 탐색은 무겁다(버프칸이 넓으면 0.1초). 필요한 버프가 있을 때만, 영역마다 한 번만 잘라 낸다
  const crops = new Map<string, { img: ImageData; gray: ReturnType<typeof toGray> } | null>();
  const regionImage = (b: BuffEntry, region: SavedRegion) => {
    const key = b.slot ? `slot:${b.id}` : "buffbar";
    if (!crops.has(key)) {
      const img = screenCapture.crop(region);
      if (img) debugCrops.set(b.slot ? `slot:${b.id}` : "buffbar", img);
      crops.set(key, img ? { img, gray: toGray(img) } : null);
    }
    return crops.get(key) ?? null;
  };
  for (const b of p.buffs) {
    const rt = buffRuntime(b.id);
    const region = buffRegion(p, b);
    const ts = templatesOf(b);
    if (!b.enabled || !ts.length || !live || !region || !regionValidFor(region, screenCapture.width, screenCapture.height)) continue;
    // 마지막 위치 주변에서 방금(1초 안) 다시 찾은 아이콘은 그대로 있는 것으로 본다 (위치가 바뀌면 놓치고 다시 전체 탐색)
    if (rt.presence.present && now - rt.localHitAt < 1000) {
      onBuffEvent(b, rt, rt.presence.observe(true, now), now);
      continue;
    }
    const full = regionImage(b, region);
    if (!full) continue;
    const { img, gray } = full;
    let m: ReturnType<typeof findTemplate>[number] | undefined;
    ts.forEach((t, i) => {
      const r = findTemplate(img, gray, t, 1)[0];
      if (r && (!m || r.score > m.score)) {
        m = r;
        rt.tplIdx = i;
      }
    });
    rt.score = m?.score ?? 0;
    rt.colorDist = m?.colorDist ?? 0;
    const hit = !!m && m.score >= minScoreOf(b) && m.colorDist <= 60;
    if (hit && m) rt.lastPos = { x: region.x + m.x, y: region.y + m.y };
    const ev = rt.presence.observe(hit, now);
    onBuffEvent(b, rt, ev, now);
    if (!hit) rt.readText = null;
  }
}

/**
 * 남은 시간을 읽는 버프는 매 tick(0.25초) 마지막 위치 주변만 다시 찾아 숫자를 읽는다.
 * (버프칸 전체 탐색은 0.5초마다, 이건 작은 창이라 가볍다)
 */
export function trackBuffIcons(p: Profile, now: number, live: boolean) {
  if (!live) return;
  for (const b of p.buffs) {
    if (!b.enabled || !templatesOf(b).length || !b.readTime || b.kind !== "expiry") continue;
    if (!regionValidFor(buffRegion(p, b), screenCapture.width, screenCapture.height)) continue;
    const rt = buffRuntime(b.id);
    if (!rt.presence.present || !rt.lastPos) continue;
    const t = templatesOf(b)[rt.tplIdx] ?? templatesOf(b)[0];
    const pad = 4;
    const wx = Math.max(0, rt.lastPos.x - pad);
    const wy = Math.max(0, rt.lastPos.y - pad);
    const img = screenCapture.crop({ x: wx, y: wy, w: t.gray.width + pad * 2, h: t.gray.height + pad * 2 });
    if (!img) continue;
    const m = findTemplate(img, toGray(img), t, 1)[0];
    if (!m || m.score < minScoreOf(b) || m.colorDist > 60) continue;
    rt.lastPos = { x: wx + m.x, y: wy + m.y };
    rt.localHitAt = now;
    rt.score = m.score;
    rt.colorDist = m.colorDist;
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
  if (!read || read.seconds < 1) {
    rt.readEsts.reset();
    return;
  }
  rt.lastReadAt = now;
  const agreed = rt.readEsts.add(frameTime(now) + read.seconds * 1000 + 500);
  if (agreed == null) return;
  const { endsAt, change } = applyExpiry(rt.endsAt, agreed, 2500);
  if (change === "new" || change === "extended") {
    rt.alerted = false;
    runners.get(`buff:${b.id}`)?.reset();
  }
  // 다시 쓰거나 연장된 버프: 그 전 숫자와 이어서 세면 숫자 이름이 어긋나므로 학습 기록을 새로 시작
  if (change === "extended") rt.recorder.reset();
  rt.endsAt = endsAt;
}

/** 특수 코어는 이름만, 버프는 남았으면 '곧 끝나요' / 사라졌으면 '끝났어요' */
function buffRunner(b: BuffEntry, rt: BuffRuntime) {
  return runner(
    `buff:${b.id}`,
    b.name,
    () => profileStore.get().buffs.find((x) => x.id === b.id)?.alert ?? b.alert,
    () => (b.kind === "cooldown" ? b.name : endingText(b.name, rt.endsAt)),
  );
}

function onBuffEvent(b: BuffEntry, rt: BuffRuntime, ev: "appeared" | "disappeared" | null, now: number) {
  const r = buffRunner(b, rt);
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
    } else if (rt.endsAt != null && rt.endsAt > now) {
      // 깜빡이다 다시 보인 같은 버프: 알고 있던 종료 시각과 알림 여부를 그대로 둔다
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
    if (!keepEndAfterVanish(rt.endsAt, rt.alerted, b.leadSec, now)) rt.endsAt = null;
    pauseLinkedTimers(b.id, now);
    if (b.alertOnDisappear) {
      r.reset();
      r.trigger(now);
    }
  }
}

export function tickBuffTimers(p: Profile, now: number) {
  const out: Record<string, BuffLive> = {};
  for (const b of p.buffs) {
    const rt = buffRuntime(b.id);
    const r = buffRunner(b, rt);
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
      // 남은 시간을 읽는 버프가 끝나고 3초가 지나도록 숫자가 안 읽히면 끝난 것 (비슷한 아이콘이 잡혀 '있음'으로 남아도)
      const readEnded = b.readTime && remaining < -3000 && now - rt.lastReadAt > 3000;
      if (remaining < -60000 || readEnded || (b.kind === "expiry" && rt.alerted && !rt.presence.present && remaining <= 0)) rt.endsAt = null;
    }
    r.tick(now);
    out[b.id] = {
      regionOk: buffRegionOk(p, b),
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
