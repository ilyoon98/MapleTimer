/**
 * 화면 전체 밝기가 평소의 55% 아래로 떨어지면 화면 전환(맵 이동·로딩)으로 보고, 밝기가 돌아온 뒤 1.5초까지 전환 중으로 친다.
 * 평소 밝기는 전환이 아닐 때만 천천히 따라간다.
 * 밝은 맵에서 어두운 맵으로 오면 계속 '평소보다 어두움'이라 전환이 끝나지 않으므로,
 * 검은 화면은 아닌 채로 3초 넘게 그대로면 그 밝기를 새 평소 밝기로 삼는다.
 */
export class ScreenTransitionDetector {
  private base = 0;
  private until = 0;
  private dimSince: number | null = null;

  /** stats 가 null 이면 공유가 끊긴 것: 평소 밝기를 새로 잰다 (다시 켠 화면은 전혀 다른 장면일 수 있다) */
  update(stats: { mean: number } | null, now: number): boolean {
    if (!stats) {
      this.base = 0;
      this.until = 0;
      this.dimSince = null;
      return false;
    }
    if (this.base > 20 && stats.mean < this.base * 0.55) {
      this.dimSince = stats.mean < 20 ? null : (this.dimSince ?? now); // 로딩 중 검은 화면은 기다린다
      if (this.dimSince != null && now - this.dimSince >= 3000) {
        this.base = stats.mean;
        this.dimSince = null;
        this.until = now;
      } else this.until = now + 1500;
    } else {
      this.dimSince = null;
      if (now >= this.until) this.base = this.base ? this.base * 0.9 + stats.mean * 0.1 : stats.mean;
    }
    return now < this.until;
  }
}
