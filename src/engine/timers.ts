import { leadText } from "../alerts/speech";
import { profileStore, shortName, updateTimer, type Profile } from "../state/profile";
import { runner, runners } from "./shared";

/* ───────── 일반 타이머 ───────── */
const timerAlerted = new Set<string>();
export function resetTimerAlert(id: string) {
  timerAlerted.delete(id);
  runners.get(`timer:${id}`)?.reset();
}

/** 버프 연계: 아이콘이 나타나면 연계한 타이머 시작 (일시정지였으면 이어서) */
export function startLinkedTimers(buffId: string, now: number) {
  for (const t of profileStore.get().timers)
    if (t.enabled && t.linkedBuffId === buffId) {
      if (t.pauseWithoutBuff && t.pausedRemainingMs != null && t.pausedRemainingMs > 0) {
        // 일시정지돼 있던 타이머는 이어서 진행
        updateTimer(t.id, { endsAt: now + t.pausedRemainingMs, pausedRemainingMs: null });
        continue;
      }
      // 아이콘이 잠깐 가려졌다 다시 보인 것: 한창 진행 중인 타이머는 처음부터 다시 시작하지 않는다
      if (t.endsAt != null && t.endsAt - now > 30_000) continue;
      updateTimer(t.id, { endsAt: now + t.durationSec * 1000, pausedRemainingMs: null });
      runners.get(`timer:${t.id}`)?.reset();
      timerAlerted.delete(t.id);
    }
}

/** 버프 연계: 아이콘이 사라지면 '버프 없으면 일시정지' 타이머를 멈춘다 */
export function pauseLinkedTimers(buffId: string, now: number) {
  for (const t of profileStore.get().timers)
    if (t.linkedBuffId === buffId && t.pauseWithoutBuff && t.endsAt != null && t.endsAt > now)
      updateTimer(t.id, { endsAt: null, pausedRemainingMs: t.endsAt - now });
}

export function tickTimers(p: Profile, now: number) {
  for (const t of p.timers) {
    const r = runner(
      `timer:${t.id}`,
      shortName(t.name),
      () => profileStore.get().timers.find((x) => x.id === t.id)?.alert ?? t.alert,
      // 자동 재시작이면 울릴 때 이미 다음 주기로 넘어가 있으므로 알림 시점으로 정한다
      () => leadText(shortName(t.name), t.leadSec),
    );
    if (!t.enabled) {
      r.reset();
      timerAlerted.delete(t.id);
      continue;
    }
    if (t.endsAt != null) {
      const remaining = t.endsAt - now;
      if (!timerAlerted.has(t.id) && remaining <= t.leadSec * 1000) {
        timerAlerted.add(t.id);
        // 자동 재시작으로 다시 도는 주기에도 울리도록 지난 주기의 알림 상태를 지운다
        r.reset();
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
