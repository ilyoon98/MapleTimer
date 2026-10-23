/**
 * 화면에서 읽은 숫자로 계산한 '시각' 추정값(사용 시각, 종료 시각 등)을
 * 최근 need 개가 서로 tolMs 안으로 맞을 때만 믿는다. 한두 번 잘못 읽은 값을 걸러내기 위함.
 */
export class EstimateConsensus {
  private ests: number[] = [];

  constructor(
    private tolMs: number,
    private need = 3,
  ) {}

  reset() {
    this.ests = [];
  }

  get count() {
    return this.ests.length;
  }

  /** 추정값을 넣는다. 최근 need 개가 맞으면 그 평균을, 아니면 null */
  add(est: number): number | null {
    this.ests = [...this.ests.filter((e) => Math.abs(e - est) <= this.tolMs), est].slice(-this.need);
    return this.ests.length >= this.need ? this.ests.reduce((a, b) => a + b, 0) / this.ests.length : null;
  }
}

export type ExpiryChange = "new" | "extended" | "corrected" | null;

/**
 * 합의된 종료 시각을 현재 종료 시각에 반영하는 규칙 (버프 남은 시간 읽기).
 * - 처음 확인 → new
 * - sameTolMs 안이면 그대로 (null)
 * - 더 늦어짐 → extended (재사용·자석펫 연장: 알림을 다시 해야 함)
 * - 더 빨라짐 → corrected (앞서 잘못 잡은 것을 바로잡음)
 */
export function applyExpiry(current: number | null, agreed: number, sameTolMs: number): { endsAt: number | null; change: ExpiryChange } {
  if (current == null) return { endsAt: agreed, change: "new" };
  if (Math.abs(agreed - current) <= sameTolMs) return { endsAt: current, change: null };
  return { endsAt: agreed, change: agreed > current ? "extended" : "corrected" };
}

/** 숫자로 종료 시각을 맞추는 타이머(부스터)의 상태 */
export interface ReadTimer {
  endsAt: number | null;
  /** 이번 주기 알림을 이미 했음 */
  alerted: boolean;
}

/**
 * 합의된 종료 시각을 부스터 상태에 반영. newCycle 이면 알림 실행기를 새로 시작해야 한다.
 * - 처음이거나 5초 넘게 늦어짐 → 새 주기 (이미 알림 시점이 지났으면 이번 주기는 조용히 넘긴다)
 * - 1.5초 안 → 평균으로 다듬기
 * - 그 밖 → 앞서 잘못 읽은 값으로 잡은 종료 시각을 바로잡기 (알림 여부는 그대로: 시점이 지났으면 바로 울린다)
 */
export function applyBoosterReading(cur: ReadTimer, agreed: number, now: number, leadSec: number): { next: ReadTimer; newCycle: boolean } {
  if (cur.endsAt == null || agreed - cur.endsAt > 5000) return { next: { endsAt: agreed, alerted: agreed - now <= leadSec * 1000 }, newCycle: true };
  if (Math.abs(agreed - cur.endsAt) <= 1500) return { next: { ...cur, endsAt: (cur.endsAt + agreed) / 2 }, newCycle: false };
  return { next: { ...cur, endsAt: agreed }, newCycle: false };
}

/**
 * 매 tick: 알림 시점이 됐으면 fire, 끝나는 시각이 3초(알림 시점이 종료 뒤면 그 뒤 1초) 넘게 지났으면 끝난 것으로 치운다.
 * 치우기 전에 알림부터 봐야 종료 뒤(음수) 알림도 울린다.
 */
export function stepReadTimer(cur: ReadTimer, now: number, leadSec: number): { next: ReadTimer; fire: boolean } {
  let { endsAt, alerted } = cur;
  let fire = false;
  if (endsAt != null && !alerted && endsAt - now <= leadSec * 1000) {
    alerted = true;
    fire = true;
  }
  if (endsAt != null && now > endsAt + Math.max(3000, -leadSec * 1000 + 1000)) endsAt = null;
  return { next: { endsAt, alerted }, fire };
}

/**
 * 버프 아이콘이 사라졌을 때 종료 시각을 남겨 둘지:
 * 예정대로(5초 안) 끝났는데 알림 시점이 종료 뒤(음수)라 아직 안 울렸으면 그때까지 남겨 둔다.
 * 일찍 끝냈거나(취소) 이미 울렸으면 치운다.
 */
export function keepEndAfterVanish(endsAt: number | null, alerted: boolean, leadSec: number, now: number): boolean {
  return !alerted && leadSec < 0 && endsAt != null && endsAt - now <= 5000;
}
