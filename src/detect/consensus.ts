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
