import { meanAbsDiff, meanLuma, toGray, type Gray, type Pixels } from "../cv/image";

/**
 * 퀵슬롯 아이콘으로 스킬 사용 시점을 감지한다.
 * 사용 가능한 상태(밝은 아이콘)를 기준 이미지로 저장해 두고,
 * 아이콘이 어두워지면(쿨타임 오버레이) 그 순간을 스킬 사용 시점으로 본다.
 */
export type IconState = "ready" | "cooling" | "unknown";

export interface QuickslotOptions {
  /** 기준 이미지와의 평균 밝기 차이가 이 값 이하면 '사용 가능' */
  readyMaxDiff: number;
  /** 평균 밝기가 기준의 이 비율 이하로 떨어지면 '쿨타임' */
  coolingLumaRatio: number;
  /** 쿨타임 판정이 연속 몇 번 나와야 사용으로 확정할지 */
  confirmTicks: number;
}

export const DEFAULT_QUICKSLOT_OPTIONS: QuickslotOptions = {
  readyMaxDiff: 22,
  coolingLumaRatio: 0.78,
  confirmTicks: 2,
};

export interface ReadyReference {
  data: number[];
  width: number;
  height: number;
}

export function makeReference(img: Pixels): ReadyReference {
  const g = toGray(img);
  return { data: Array.from(g.data, (v) => Math.round(v)), width: g.width, height: g.height };
}

function refToGray(r: ReadyReference): Gray {
  return { data: Float32Array.from(r.data), width: r.width, height: r.height };
}

export interface QuickslotReading {
  state: IconState;
  diff: number;
  lumaRatio: number;
}

export class QuickslotCastDetector {
  private ref: Gray | null = null;
  private refLuma = 0;
  private lastStable: IconState = "unknown";
  private coolingStreak = 0;
  private coolingStartAt = 0;
  last: QuickslotReading | null = null;

  constructor(public opts: QuickslotOptions = DEFAULT_QUICKSLOT_OPTIONS) {}

  setReference(ref: ReadyReference | null) {
    this.ref = ref ? refToGray(ref) : null;
    this.refLuma = this.ref ? meanLuma(this.ref) : 0;
    this.lastStable = "unknown";
    this.coolingStreak = 0;
  }

  get hasReference() {
    return !!this.ref;
  }

  classify(img: Pixels): QuickslotReading {
    if (!this.ref) return { state: "unknown", diff: NaN, lumaRatio: NaN };
    const g = toGray(img);
    const diff = meanAbsDiff(g, this.ref);
    const lumaRatio = this.refLuma > 0 ? meanLuma(g) / this.refLuma : 1;
    let state: IconState = "unknown";
    if (diff <= this.opts.readyMaxDiff) state = "ready";
    else if (lumaRatio <= this.opts.coolingLumaRatio) state = "cooling";
    return { state, diff, lumaRatio };
  }

  /** 한 프레임 관찰. 스킬 사용이 확정되면 사용 시각(ms)을 돌려준다 */
  observe(img: Pixels, now: number): number | null {
    const r = this.classify(img);
    this.last = r;
    if (r.state === "cooling") {
      if (this.coolingStreak === 0) this.coolingStartAt = now;
      this.coolingStreak++;
      if (this.lastStable === "ready" && this.coolingStreak >= this.opts.confirmTicks) {
        this.lastStable = "cooling";
        return this.coolingStartAt;
      }
      if (this.lastStable === "unknown" && this.coolingStreak >= this.opts.confirmTicks) {
        // 켜는 시점에 이미 쿨타임이면 사용 시각을 모르므로 다음 사용을 기다린다
        this.lastStable = "cooling";
      }
    } else {
      this.coolingStreak = 0;
      if (r.state === "ready") this.lastStable = "ready";
    }
    return null;
  }
}
