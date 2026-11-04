/** 프레임 번호는 세션마다 달라져도 된다. 같은 화면을 중복 관측하지 않는다. */
export class FrameGate {
  private session = -1;
  private frame = -1;
  private watching = false;
  private lastAt: number | null = null;
  sample(session: number, frame: number, at: number | null, now: number, available: boolean) {
    const usable = available && at != null && now - at <= 2500;
    const reset = session !== this.session || (!usable && this.watching)
      || (usable && this.lastAt != null && at! - this.lastAt > 2500);
    if (reset) this.frame = -1;
    const fresh = usable && (session !== this.session || frame !== this.frame);
    this.session = session;
    this.watching = usable;
    if (fresh) { this.frame = frame; this.lastAt = at; }
    return { usable, fresh, reset };
  }
}
