import { expectedText, glyphSimilarity, segment, GH, GW, type DigitTemplates, type Glyph, type Segmented } from "../cv/digits";
import { createPersistentStore } from "../state/createStore";

/* ───────── 학습한 숫자 모양 저장소 ───────── */
/** 글자 높이(px)별로 따로 모은다: 퀵슬롯 숫자와 버프 숫자의 크기가 다를 수 있어서 */
interface DigitSet {
  h: number;
  /** 숫자별 누적 합 (GW*GH) */
  sums: Array<number[] | null>;
  counts: number[];
}
interface LearnedDigits {
  v: 2;
  sets: DigitSet[];
}
const emptyLearned = (): LearnedDigits => ({ v: 2, sets: [] });
const emptySet = (h: number): DigitSet => ({ h, sums: Array(10).fill(null), counts: Array(10).fill(0) });
const heightBucket = (h: number) => Math.round(h / 2) * 2;

export const digitStore = createPersistentStore<LearnedDigits>("maple-timer-personal.digits.v2", emptyLearned(), (raw) => {
  const r = raw as LearnedDigits;
  return r?.v === 2 && Array.isArray(r.sets) ? r : emptyLearned();
});

export function resetLearnedDigits() {
  digitStore.set(() => emptyLearned());
  cache = null;
}

/** 0~9 중 (어느 크기로든) 배운 숫자 개수 */
export function learnedDigitCount(s = digitStore.get()) {
  let n = 0;
  for (let d = 0; d < 10; d++) if (s.sets.some((set) => set.counts[d] > 0)) n++;
  return n;
}

export function addDigitSamples(samples: Array<{ digit: number; v: Float32Array; h: number }>) {
  digitStore.set((s) => {
    const sets = s.sets.map((x) => ({ h: x.h, sums: x.sums.map((y) => (y ? [...y] : null)), counts: [...x.counts] }));
    for (const { digit, v, h } of samples) {
      const hb = heightBucket(h);
      let set = sets.find((x) => x.h === hb);
      if (!set) sets.push((set = emptySet(hb)));
      // 너무 많이 쌓이면 새로 배운 모양이 반영되지 않으므로 상한
      if (set.counts[digit] >= 200) continue;
      const acc = set.sums[digit] ?? new Array(GW * GH).fill(0);
      for (let i = 0; i < acc.length; i++) acc[i] += v[i];
      set.sums[digit] = acc;
      set.counts[digit]++;
    }
    return { v: 2, sets };
  });
  cache = null;
}

/* ───────── 글꼴로 그린 기본 템플릿 (학습 전 임시) ───────── */
let fontTemplates: DigitTemplates | null = null;
function buildFontTemplates(): DigitTemplates {
  const out: DigitTemplates = Array.from({ length: 10 }, () => []);
  if (typeof document === "undefined") return out;
  const fonts = ["bold 26px Arial", "bold 26px Tahoma", "bold 26px Verdana", "bold 26px 'Malgun Gothic'", "900 26px sans-serif"];
  const c = document.createElement("canvas");
  c.width = 40;
  c.height = 40;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  for (const font of fonts)
    for (let d = 0; d < 10; d++) {
      ctx.fillStyle = "#304050";
      ctx.fillRect(0, 0, 40, 40);
      ctx.font = font;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#000";
      ctx.strokeText(String(d), 20, 21);
      ctx.fillStyle = "#fff";
      ctx.fillText(String(d), 20, 21);
      const g = segment(ctx.getImageData(0, 0, 40, 40)).glyphs;
      if (g.length === 1) out[d].push(g[0].v);
    }
  return out;
}

let cache: DigitTemplates | null = null;
/** 학습한 숫자가 있으면 그것을, 없는 숫자는 글꼴 템플릿을 쓴다 */
export function activeTemplates(): DigitTemplates {
  if (cache) return cache;
  fontTemplates ??= buildFontTemplates();
  const s = digitStore.get();
  cache = Array.from({ length: 10 }, (_, d) => {
    const learned = s.sets
      .filter((set) => set.counts[d] > 0 && set.sums[d])
      .map((set) => Float32Array.from(set.sums[d]!, (x) => x / set.counts[d]));
    return learned.length ? learned : fontTemplates![d];
  });
  return cache;
}

/* ───────── 쿨타임 한 바퀴를 지켜보며 숫자 학습 ───────── */
interface SeqState {
  glyphs: Glyph[];
  colon: boolean;
  first: number;
  last: number;
  samples: number;
}

export interface LearnResult {
  ok: boolean;
  reason: string;
  samples: Array<{ digit: number; v: Float32Array; h: number }>;
}

function sameGlyphs(a: Glyph[], b: Glyph[]) {
  return a.length === b.length && a.every((g, i) => glyphSimilarity(g.v, b[i].v) >= 0.9);
}

/**
 * 숫자가 나타났다가 사라질 때까지 화면에 찍힌 값들의 '순서'를 기록한다.
 * 쿨타임은 1초마다 1씩 줄어들고 마지막 값은 1 이므로, 끝에서부터 1, 2, 3… 으로 이름을 붙여 학습한다.
 * (시계로 계산하지 않아서 반올림 오차로 잘못 배우는 일이 없다)
 */
export class CooldownSequenceRecorder {
  private states: SeqState[] = [];
  private recording = false;
  private seenStreak = 0;
  private lastSeenAt = 0;
  status: "idle" | "recording" = "idle";
  lastResult: LearnResult | null = null;

  /**
   * maxStates: 끝에서부터 세므로 마지막 몇 개 값만 있으면 된다 (긴 버프용)
   * autoFinish: 숫자가 1.5초 안 보이면 끝난 것으로 볼지 (버프는 아이콘이 사라질 때 finishNow 로 끝낸다)
   */
  constructor(
    private maxStates = 200,
    private autoFinish = true,
  ) {}

  /** 버프 아이콘이 사라진 순간처럼, 끝난 시점을 바깥에서 알 때 바로 마무리 */
  finishNow(): LearnResult | null {
    if (!this.recording) return null;
    const res = this.finish();
    this.reset();
    this.lastResult = res;
    return res;
  }

  reset() {
    this.states = [];
    this.recording = false;
    this.seenStreak = 0;
    this.status = "idle";
  }

  get observedValues() {
    return this.states.length;
  }

  /** 한 프레임 관찰. 기록이 끝나면 학습 결과를 돌려준다 */
  feed(seg: Segmented, now: number): LearnResult | null {
    const has = seg.glyphs.length > 0 && seg.glyphs.length <= 5;
    if (has) {
      this.lastSeenAt = now;
      this.seenStreak++;
      if (!this.recording && this.seenStreak >= 2) {
        this.recording = true;
        this.status = "recording";
        this.states = [];
      }
      if (this.recording) {
        const cur = this.states[this.states.length - 1];
        if (cur && sameGlyphs(cur.glyphs, seg.glyphs)) {
          cur.last = now;
          cur.samples++;
          cur.glyphs = seg.glyphs;
        } else {
          this.states.push({ glyphs: seg.glyphs, colon: seg.hasColon, first: now, last: now, samples: 1 });
          if (this.states.length > this.maxStates) this.states.shift();
        }
      }
      return null;
    }
    this.seenStreak = 0;
    if (this.autoFinish && this.recording && now - this.lastSeenAt >= 1500) {
      const res = this.finish();
      this.reset();
      this.lastResult = res;
      return res;
    }
    return null;
  }

  private finish(): LearnResult {
    // 잠깐 스친 잡음 상태 제거 후, 같은 모양이 연달아 있으면 합친다
    const clean: SeqState[] = [];
    for (const s of this.states) {
      if (s.samples < 2) continue;
      const prev = clean[clean.length - 1];
      if (prev && sameGlyphs(prev.glyphs, s.glyphs)) {
        prev.last = s.last;
        prev.samples += s.samples;
      } else clean.push({ ...s });
    }
    const n = clean.length;
    // 10 이상부터 세어야 9→10 경계로 순서를 검증할 수 있다
    if (n < 10) return { ok: false, reason: `관찰한 값이 너무 적어요 (${n}개, 쿨타임 10초 이상인 스킬로 학습해 주세요)`, samples: [] };
    const durs = clean
      .slice(1, -1)
      .map((s, i) => clean[i + 2].first - s.first)
      .sort((a, b) => a - b);
    const med = durs[Math.floor(durs.length / 2)] ?? 1000;
    if (med < 700 || med > 1400) return { ok: false, reason: `숫자가 1초마다 바뀌지 않아요 (${Math.round(med)}ms)`, samples: [] };

    const samples: LearnResult["samples"] = [];
    let mismatch = 0;
    for (let i = 0; i < n; i++) {
      const value = n - i; // 끝에서부터 1, 2, 3…
      const text = expectedText(value, clean[i].colon).replace(/:/g, "");
      if (text.length !== clean[i].glyphs.length) {
        mismatch++;
        continue;
      }
      clean[i].glyphs.forEach((g, k) => samples.push({ digit: Number(text[k]), v: g.v, h: g.h }));
    }
    // 9 → 10 경계에서 글자 수가 정확히 맞아야 순서가 한 칸 밀리지 않았다고 확신할 수 있다
    const s9 = clean[n - 9],
      s10 = clean[n - 10];
    const ok9 = s9.colon || s9.glyphs.length === 1;
    const ok10 = s10.colon || s10.glyphs.length === 2;
    if (!ok9 || !ok10) return { ok: false, reason: "숫자 순서를 맞추지 못했어요 (9→10 경계 불일치)", samples: [] };
    if (mismatch > 1) return { ok: false, reason: `글자 수가 안 맞는 값이 ${mismatch}개 있어요`, samples: [] };
    return { ok: true, reason: `${n}개 값에서 숫자 ${samples.length}개 학습`, samples };
  }
}
