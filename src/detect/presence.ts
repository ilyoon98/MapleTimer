/**
 * 아이콘이 '나타남/사라짐'을 몇 프레임 연속으로 확인해 깜빡임을 걸러낸다.
 */
export type PresenceEvent = "appeared" | "disappeared" | null;

export class PresenceTracker {
  present = false;
  private hitStreak = 0;
  private missStreak = 0;
  lastSeenAt: number | null = null;
  appearedAt: number | null = null;

  constructor(
    public appearTicks = 2,
    public disappearTicks = 2,
  ) {}

  reset() {
    this.present = false;
    this.hitStreak = 0;
    this.missStreak = 0;
    this.lastSeenAt = null;
    this.appearedAt = null;
  }

  observe(hit: boolean, now: number): PresenceEvent {
    if (hit) {
      this.lastSeenAt = now;
      this.missStreak = 0;
      this.hitStreak++;
      if (!this.present && this.hitStreak >= this.appearTicks) {
        this.present = true;
        this.appearedAt = now;
        return "appeared";
      }
    } else {
      this.hitStreak = 0;
      this.missStreak++;
      if (this.present && this.missStreak >= this.disappearTicks) {
        this.present = false;
        return "disappeared";
      }
    }
    return null;
  }
}
