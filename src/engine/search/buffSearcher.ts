/**
 * 버프칸 탐색 작업 관리 (메인 스레드 쪽).
 * - 한 번에 한 작업만: 앞 작업이 안 끝났으면 새 화면은 쌓지 않고 건너뛴다 (busy)
 * - 결과에는 요청 때의 세션·화면·영역 정보가 붙어 있어, 그 사이 바뀌었으면 쓰지 않는다 (판단은 받는 쪽)
 * - 너무 오래 걸리거나 오류가 나면 워커를 새로 만든다 (세대 번호가 오르고 예전 결과는 버린다)
 * - 워커를 못 쓰는 환경(테스트 등)이면 같은 계산을 그 자리에서 한다
 */
import { TemplateBank, runSearch, type SearchHit, type SearchItem, type SearchRegion, type TemplateDef } from "./buffSearch";

export interface SearchMeta {
  /** 요청한 시각 (엔진 시각) */
  at: number;
  [k: string]: unknown;
}

export interface SearchDone<M extends SearchMeta> {
  meta: M;
  hits: SearchHit[];
  /** 탐색에 걸린 시간 / 요청부터 받기까지 걸린 시간 (ms) */
  workMs: number;
  latencyMs: number;
}

/** 워커가 연달아 이만큼 실패하면(불러오기 실패 등) 그 자리 계산으로 바꾼다 */
export const MAX_CONSECUTIVE_FAILURES = 3;

/** 처음 한 번은 준비가 있어 넉넉히, 그다음은 짧게 */
export const COLD_TIMEOUT_MS = 10_000;
export const WARM_TIMEOUT_MS = 2_000;

export interface SearcherStats {
  mode: "worker" | "inline";
  generation: number;
  requested: number;
  completed: number;
  busy: number;
  timeouts: number;
  errors: number;
  lastWorkMs: number;
  lastLatencyMs: number;
}

interface WorkerLike {
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
}

export class BuffSearcher<M extends SearchMeta = SearchMeta> {
  private worker: WorkerLike | null = null;
  private sent = new Set<string>();
  private seq = 0;
  private inflight: { requestId: number; meta: M; startedAt: number; cold: boolean } | null = null;
  private done: SearchDone<M> | null = null;
  private warm = false;
  private failures = 0;
  private bank = new TemplateBank();
  readonly stats: SearcherStats;

  constructor(
    private makeWorker: (() => WorkerLike) | null,
    private clock: () => number = () => performance.now(),
  ) {
    this.stats = { mode: makeWorker ? "worker" : "inline", generation: 0, requested: 0, completed: 0, busy: 0, timeouts: 0, errors: 0, lastWorkMs: 0, lastLatencyMs: 0 };
  }

  get isBusy() {
    return this.inflight != null;
  }

  /** 작업을 넘긴다. 앞 작업이 아직이면 false (이번 화면은 건너뜀) */
  submit(defs: TemplateDef[], regions: SearchRegion[], items: SearchItem[], meta: M): boolean {
    this.checkTimeout();
    if (this.inflight) {
      this.stats.busy++;
      return false;
    }
    this.stats.requested++;
    const requestId = ++this.seq;
    const startedAt = this.clock();
    const w = this.ensureWorker();
    if (!w) {
      for (const d of defs) this.bank.define(d);
      const hits = runSearch(this.bank, regions, items);
      const ms = this.clock() - startedAt;
      this.finish({ meta, hits, workMs: ms, latencyMs: ms });
      return true;
    }
    const fresh = defs.filter((d) => !this.sent.has(d.key));
    for (const d of fresh) this.sent.add(d.key);
    this.inflight = { requestId, meta, startedAt, cold: !this.warm };
    w.postMessage({ requestId, defs: fresh, regions, items }, regions.map((r) => r.data.buffer as ArrayBuffer));
    return true;
  }

  /** 끝난 작업이 있으면 꺼낸다 (한 번만) */
  take(): SearchDone<M> | null {
    this.checkTimeout();
    const d = this.done;
    this.done = null;
    return d;
  }

  /** 지금 하던 작업과 남은 결과를 버린다 (공유를 새로 시작했을 때 등) */
  cancel() {
    this.done = null;
    if (this.inflight) this.restart();
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.inflight = null;
  }

  private finish(d: SearchDone<M>) {
    this.stats.completed++;
    this.stats.lastWorkMs = d.workMs;
    this.stats.lastLatencyMs = d.latencyMs;
    this.done = d;
  }

  private checkTimeout() {
    const f = this.inflight;
    if (!f) return;
    if (this.clock() - f.startedAt > (f.cold ? COLD_TIMEOUT_MS : WARM_TIMEOUT_MS)) {
      this.stats.timeouts++;
      this.fail();
    }
  }

  /** 시간 초과·오류: 워커를 새로 만들고, 연달아 실패하면 워커를 그만 쓴다 */
  private fail() {
    this.restart();
    if (++this.failures >= MAX_CONSECUTIVE_FAILURES) {
      this.makeWorker = null;
      this.stats.mode = "inline";
    }
  }

  private restart() {
    this.worker?.terminate();
    this.worker = null;
    this.inflight = null;
    this.sent.clear();
    this.warm = false;
  }

  private ensureWorker(): WorkerLike | null {
    if (!this.makeWorker) return null;
    if (this.worker) return this.worker;
    try {
      this.worker = this.makeWorker();
    } catch {
      // 워커를 못 만들면 그 자리에서 계산한다
      this.makeWorker = null;
      this.stats.mode = "inline";
      return null;
    }
    this.stats.generation++;
    const w = this.worker;
    w.onmessage = (e: MessageEvent<{ requestId: number; hits?: SearchHit[]; workMs?: number; error?: string }>) => {
      if (w !== this.worker) return; // 예전 워커의 늦은 답
      const f = this.inflight;
      if (!f || e.data.requestId !== f.requestId) return;
      this.inflight = null;
      if (e.data.error || !e.data.hits) {
        this.stats.errors++;
        this.fail();
        return;
      }
      this.warm = true;
      this.failures = 0;
      this.finish({ meta: f.meta, hits: e.data.hits, workMs: e.data.workMs ?? 0, latencyMs: this.clock() - f.startedAt });
    };
    w.onerror = () => {
      if (w !== this.worker) return;
      this.stats.errors++;
      this.fail();
    };
    return w;
  }
}

/** 브라우저에서는 워커로, 워커가 없는 환경에서는 그 자리에서 */
export function createBuffSearcher<M extends SearchMeta>(): BuffSearcher<M> {
  if (typeof Worker === "undefined") return new BuffSearcher<M>(null);
  return new BuffSearcher<M>(() => new Worker(new URL("./buffSearch.worker.ts", import.meta.url), { type: "module" }) as unknown as WorkerLike);
}
