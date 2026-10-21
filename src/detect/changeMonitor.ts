import { toGray, type Pixels } from "../cv/image";

/**
 * 영역의 '변화 없음'을 감지한다 (사냥 멈춤 알림).
 * - 경험치바: 경험치 숫자/바가 일정 시간 안 바뀌면 멈춘 것으로 본다.
 * - 쿨타임: 자주 쓰는 스킬 아이콘이 일정 시간 안 바뀌면 멈춘 것으로 본다.
 * 영역을 cell×cell 블록 평균 밝기 격자로 줄여 비교하고, 블록 하나라도 크게 바뀌면 '변화'로 친다.
 */
export interface ChangeMonitorOptions {
  /** 블록 크기(px) */
  cell: number;
  /** 블록 평균 밝기가 이만큼 이상 바뀌면 변화 (0~255) */
  cellDiff: number;
  /** 변화로 인정할 최소 블록 수 */
  minChangedCells: number;
}

export const DEFAULT_CHANGE_OPTIONS: ChangeMonitorOptions = { cell: 3, cellDiff: 14, minChangedCells: 1 };

export interface ChangeSample {
  changedCells: number;
  totalCells: number;
  changed: boolean;
}

export function fingerprint(img: Pixels, cell: number): { grid: Float32Array; gw: number; gh: number } {
  const g = toGray(img);
  const gw = Math.max(1, Math.ceil(g.width / cell));
  const gh = Math.max(1, Math.ceil(g.height / cell));
  const sum = new Float32Array(gw * gh);
  const cnt = new Float32Array(gw * gh);
  for (let y = 0; y < g.height; y++) {
    const gy = Math.floor(y / cell) * gw;
    for (let x = 0; x < g.width; x++) {
      const k = gy + Math.floor(x / cell);
      sum[k] += g.data[y * g.width + x];
      cnt[k]++;
    }
  }
  for (let i = 0; i < sum.length; i++) sum[i] /= cnt[i] || 1;
  return { grid: sum, gw, gh };
}

export class ChangeMonitor {
  private prev: Float32Array | null = null;
  private prevSize = "";
  /** 마지막으로 변화가 확인된 시각 */
  lastChangeAt: number | null = null;
  /** 한 번이라도 변화를 본 뒤에만 알림 (켜자마자 울리는 것 방지) */
  armed = false;
  last: ChangeSample | null = null;

  constructor(public opts: ChangeMonitorOptions = DEFAULT_CHANGE_OPTIONS) {}

  reset() {
    this.prev = null;
    this.prevSize = "";
    this.lastChangeAt = null;
    this.armed = false;
    this.last = null;
  }

  observe(img: Pixels, now: number): ChangeSample {
    const fp = fingerprint(img, this.opts.cell);
    const size = `${fp.gw}x${fp.gh}`;
    let changedCells = 0;
    if (this.prev && size === this.prevSize) {
      for (let i = 0; i < fp.grid.length; i++) if (Math.abs(fp.grid[i] - this.prev[i]) >= this.opts.cellDiff) changedCells++;
    } else {
      // 첫 프레임이거나 영역 크기가 바뀜: 기준만 잡는다
      this.lastChangeAt = now;
      this.armed = false;
    }
    const changed = this.prev != null && size === this.prevSize && changedCells >= this.opts.minChangedCells;
    if (changed) {
      this.lastChangeAt = now;
      this.armed = true;
    }
    this.prev = fp.grid;
    this.prevSize = size;
    this.last = { changedCells, totalCells: fp.grid.length, changed };
    return this.last;
  }

  /** 변화가 없었던 시간(ms) */
  idleMs(now: number) {
    return this.lastChangeAt == null ? 0 : now - this.lastChangeAt;
  }

  isStalled(now: number, thresholdSec: number) {
    return this.armed && this.idleMs(now) >= thresholdSec * 1000;
  }
}
