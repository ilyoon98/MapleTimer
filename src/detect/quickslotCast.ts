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

/** 흑백 기준 이미지를 RGBA 로 (숫자 찾기 등에 다시 쓰기 위해) */
export function referenceToPixels(r: ReadyReference): Pixels {
  const data = new Uint8ClampedArray(r.width * r.height * 4);
  r.data.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  return { data, width: r.width, height: r.height };
}

export function referenceDiff(a: ReadyReference, b: ReadyReference): number {
  if (a.width !== b.width || a.height !== b.height) return Infinity;
  let s = 0;
  for (let i = 0; i < a.data.length; i++) s += Math.abs(a.data[i] - b.data[i]);
  return s / a.data.length;
}

/**
 * '사용 가능' 기준 이미지를 쿨타임 중에 잘못 저장한 경우를 스스로 고친다.
 * 기준 이미지에 숫자가 찍혀 있으면(의심) → 숫자 없이 기준보다 10% 이상 밝은 모습이
 * 3초 동안 거의 그대로 유지될 때 그 모습을 새 기준으로 제안한다.
 */
export class ReferenceHealer {
  private cand: ReadyReference | null = null;
  private since = 0;

  constructor(
    private stableMs = 3000,
    private minBrighter = 1.1,
  ) {}

  reset() {
    this.cand = null;
  }

  /** 새 기준으로 바꿀 이미지가 확정되면 돌려준다 */
  observe(opts: { suspicious: boolean; img: Pixels; hasDigits: boolean; lumaRatio: number; now: number }): ReadyReference | null {
    const { suspicious, img, hasDigits, lumaRatio, now } = opts;
    if (!suspicious || hasDigits || !(lumaRatio >= this.minBrighter)) {
      this.cand = null;
      return null;
    }
    const cur = makeReference(img);
    if (!this.cand || referenceDiff(this.cand, cur) > 8) {
      this.cand = cur;
      this.since = now;
      return null;
    }
    if (now - this.since >= this.stableMs) {
      this.cand = null;
      return cur;
    }
    return null;
  }
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

  /**
   * textMask 를 주면 쿨타임 숫자(밝은 글자) 픽셀은 밝기 비교에서 뺀다.
   * 어두워진 아이콘 위에 흰 숫자가 크게 찍히면 평균 밝기가 덜 떨어져 보이기 때문.
   */
  classify(img: Pixels, textMask?: Uint8Array): QuickslotReading {
    if (!this.ref) return { state: "unknown", diff: NaN, lumaRatio: NaN };
    const g = toGray(img);
    const diff = meanAbsDiff(g, this.ref);
    let lumaRatio: number;
    if (textMask && g.width === this.ref.width && g.height === this.ref.height) {
      let cur = 0,
        ref = 0;
      for (let i = 0; i < g.data.length; i++)
        if (!textMask[i]) {
          cur += g.data[i];
          ref += this.ref.data[i];
        }
      lumaRatio = ref > 0 ? cur / ref : 1;
    } else {
      lumaRatio = this.refLuma > 0 ? meanLuma(g) / this.refLuma : 1;
    }
    let state: IconState = "unknown";
    if (diff <= this.opts.readyMaxDiff) state = "ready";
    else if (lumaRatio <= this.opts.coolingLumaRatio) state = "cooling";
    return { state, diff, lumaRatio };
  }

  /**
   * 화면 전환(맵 이동 등으로 화면 전체가 어두워짐)이 있었음.
   * 그 사이 어두워진 아이콘을 스킬 사용으로 오해하지 않도록, 다시 '사용 가능'을 볼 때까지 사용 감지를 멈춘다.
   */
  interrupt() {
    this.coolingStreak = 0;
    this.lastStable = "unknown";
  }

  /** 한 프레임 관찰. 스킬 사용이 확정되면 사용 시각(ms)을 돌려준다 */
  observe(img: Pixels, now: number, textMask?: Uint8Array): number | null {
    const r = this.classify(img, textMask);
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
