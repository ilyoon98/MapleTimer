type Listener = (now: number) => void;

/** 워커·화면 프레임·PIP 신호를 합치는 주기 실행기. 브라우저의 강제 정지는 별개다. */
export class Ticker {
  private worker: Worker | null = null;
  private listeners = new Set<Listener>();
  private lastPulse = -Infinity;

  constructor(private intervalMs: number) {}

  start() {
    if (this.worker) return;
    this.worker = new Worker(new URL("./tickerWorker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = () => {
      this.pulse();
    };
    this.worker.postMessage({ type: "start", intervalMs: this.intervalMs });
  }

  stop() {
    this.worker?.terminate();
    this.worker = null;
    this.lastPulse = -Infinity;
  }

  /** 프레임 수신·PIP 창에서도 깨운다. 여러 신호가 겹쳐도 분석은 주기당 한 번만. */
  pulse() {
    const at = performance.now();
    if (at - this.lastPulse < this.intervalMs) return;
    this.lastPulse = at;
    for (const l of this.listeners) {
      try {
        l(Date.now());
      } catch (err) {
        console.error("[ticker]", err);
      }
    }
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

/** 앱 전역 1초 미만 간격 ticker (타이머 표시·알림 스케줄용) */
export const appTicker = new Ticker(250);
