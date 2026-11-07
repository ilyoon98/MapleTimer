import { endingText } from "../alerts/speech";
import { regionSignature } from "../capture/detectionRegions";
import { screenCapture } from "../capture/screenCapture";
import { regionValidFor } from "../capture/types";
import { segment } from "../cv/digits";
import { readSevenSegment } from "../cv/sevenSegment";
import { EstimateConsensus, applyBoosterReading, stepReadTimer } from "../detect/consensus";
import { profileStore, type Profile } from "../state/profile";
import { debugCrops, type BoosterLive } from "./live";
import { frameTime, observation, runner } from "./shared";

/* ───────── 부스터 종료 ───────── */
interface BoosterRuntime {
  ests: EstimateConsensus;
  endsAt: number | null;
  alerted: boolean;
  readText: string | null;
}
let boosterRegionKey = "";
const boosterRt: BoosterRuntime = { ests: new EstimateConsensus(1500), endsAt: null, alerted: false, readText: null };
export function resetBoosterObservations() { boosterRt.ests.reset(); }

/** 부스터 진단 화면의 '직접 가르치기'용: 마지막으로 나눈 글자 */
export let lastBoosterSegment: ReturnType<typeof segment> | null = null;

/**
 * 화면 위쪽 부스터 남은시간 숫자("36.83", 1분이 넘어도 "78.20")에서 초를 읽어 끝나기 전에 알린다.
 * 3번 연달아 1.5초 안으로 맞아야 믿고, 더 늦은 종료 시각이 확인되면(재사용) 새 주기로 본다.
 */
export function tickBooster(p: Profile, now: number, live: boolean): BoosterLive {
  const r = runner("booster", "부스터", () => profileStore.get().booster.alert, () => endingText("부스터", boosterRt.endsAt));
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
  const key = regionSignature(region);
  if (key !== boosterRegionKey) {
    boosterRegionKey = key;
    rt.ests.reset();
    rt.readText = null;
  }
  const img = screenCapture.crop(region);
  if (img) {
    debugCrops.set("booster", img);
    const seg = segment(img);
    lastBoosterSegment = seg;
    // 실제 게임의 부스터 숫자는 디지털 시계 모양이라 막대 판독기로만 읽는다.
    // 예전에는 못 읽으면 일반 숫자 판독기로 한 번 더 읽었는데, 부스터가 없을 때 배경을 '14' 같은 숫자로
    // 잘못 읽어 거짓 알림이 났다(진단 기록 2026-11-08 01:22). 막대 판독기는 'SS.cc' 모양이 아니면 아예 안 읽는다
    const read = readSevenSegment(img);
    rt.readText = read?.text ?? null;
    if (read && read.seconds > 0 && read.seconds < 3600) {
      const agreed = rt.ests.add(frameTime(now) + read.seconds * 1000, observation(now));
      if (agreed != null) {
        const { next, newCycle } = applyBoosterReading(rt, agreed, now, b.leadSec);
        rt.endsAt = next.endsAt;
        rt.alerted = next.alerted;
        if (newCycle) r.reset();
      }
    } else if (!read) {
      rt.ests.reset();
    }
  }
  // 끝난 뒤 아직 숫자가 보이면 새로 3번 맞춰 다시 잡는다
  // (예전엔 '20초 동안 못 읽으면' 끝으로 봤는데, 가끔 잘못 읽은 값이 그 시간을 계속 늘려서 '진행 중'에 멈춰 있었다)
  const step = stepReadTimer(rt, now, b.leadSec);
  rt.endsAt = step.next.endsAt;
  rt.alerted = step.next.alerted;
  if (step.fire) r.trigger(now);
  r.tick(now);
  const status: BoosterLive["status"] = rt.endsAt != null ? "running" : rt.readText ? "reading" : "searching";
  return { readText: rt.readText, lastAlertAt: r.lastFiredAt, status, endsAt: rt.endsAt };
}
