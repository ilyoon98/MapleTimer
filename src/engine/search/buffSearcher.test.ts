import { describe, expect, it } from "vitest";
import { BuffSearcher, COLD_TIMEOUT_MS, WARM_TIMEOUT_MS } from "./buffSearcher";
import { runSearch, TemplateBank } from "./buffSearch";
import { storeTemplate } from "../../cv/match";

class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  posted: Array<{ requestId: number; defs: unknown[] }> = [];
  terminated = false;
  constructor() { FakeWorker.all.push(this); }
  postMessage(msg: { requestId: number; defs: unknown[] }) { this.posted.push(msg); }
  terminate() { this.terminated = true; }
  reply(requestId: number, extra: object = { hits: [], workMs: 1 }) { this.onmessage?.({ data: { requestId, ...extra } } as MessageEvent); }
}

function setup() {
  FakeWorker.all = [];
  let t = 0;
  const s = new BuffSearcher(() => new FakeWorker(), () => t);
  const region = () => ({ key: "r", width: 1, height: 1, data: new Uint8ClampedArray(4) });
  const submit = () => s.submit([{ key: "icon:janus", icon: "janus" }], [region()], [{ buffId: "b", regionKey: "r", templateKey: "icon:janus" }], { at: t });
  return { s, submit, advance: (ms: number) => (t += ms), worker: () => FakeWorker.all[FakeWorker.all.length - 1] };
}

describe("버프칸 탐색 작업 관리", () => {
  it("앞 작업이 끝나기 전에는 새 작업을 쌓지 않는다", () => {
    const { s, submit, worker } = setup();
    expect(submit()).toBe(true);
    expect(submit()).toBe(false);
    expect(s.stats.busy).toBe(1);
    worker().reply(1);
    expect(s.take()?.hits).toEqual([]);
    expect(s.take()).toBeNull();
    expect(submit()).toBe(true);
  });
  it("같은 아이콘은 워커에 한 번만 보낸다", () => {
    const { submit, worker } = setup();
    submit();
    worker().reply(1);
    submit();
    expect(worker().posted.map((m) => m.defs.length)).toEqual([1, 0]);
  });
  it("너무 오래 걸리면 워커를 새로 만들고, 예전 워커의 늦은 답은 버린다", () => {
    const { s, submit, advance, worker } = setup();
    submit();
    const old = worker();
    advance(COLD_TIMEOUT_MS + 1);
    expect(s.take()).toBeNull();
    expect(s.stats.timeouts).toBe(1);
    expect(old.terminated).toBe(true);
    expect(submit()).toBe(true);
    expect(FakeWorker.all.length).toBe(2);
    old.reply(1);
    expect(s.take()).toBeNull();
    // 새 워커는 아이콘을 다시 받는다
    expect(worker().posted[0].defs.length).toBe(1);
  });
  it("처음 답을 받은 뒤에는 짧은 시간 제한을 쓴다", () => {
    const { s, submit, advance, worker } = setup();
    submit();
    worker().reply(1);
    s.take();
    submit();
    advance(WARM_TIMEOUT_MS + 1);
    s.take();
    expect(s.stats.timeouts).toBe(1);
  });
  it("오류가 나면 워커를 새로 만든다", () => {
    const { s, submit, worker } = setup();
    submit();
    worker().reply(1, { error: "boom" });
    expect(s.stats.errors).toBe(1);
    expect(s.isBusy).toBe(false);
    submit();
    expect(FakeWorker.all.length).toBe(2);
  });
  it("워커가 연달아 실패하면 그 자리 계산으로 바꾼다", () => {
    const { s, submit, worker } = setup();
    for (let i = 0; i < 3; i++) {
      submit();
      worker().onerror?.({} as ErrorEvent);
    }
    expect(s.stats.mode).toBe("inline");
    expect(submit()).toBe(true);
    expect(s.take()).not.toBeNull();
    expect(FakeWorker.all.length).toBe(3);
  });
  it("워커가 없으면 그 자리에서 계산한다", () => {
    const s = new BuffSearcher(null);
    expect(s.submit([], [], [], { at: 0 })).toBe(true);
    expect(s.take()?.hits).toEqual([]);
    expect(s.stats.mode).toBe("inline");
  });
});

describe("버프칸 탐색 계산", () => {
  it("영역 안의 아이콘 위치를 찾는다", () => {
    const W = 40, H = 30, tw = 10, th = 10, ox = 17, oy = 9;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const inT = x >= ox && x < ox + tw && y >= oy && y < oy + th;
      const v = inT ? ((x - ox) * 23 + (y - oy) * 41) % 256 : 30;
      data[i] = v; data[i + 1] = (v * 3) % 256; data[i + 2] = 255 - v; data[i + 3] = 255;
    }
    const tpl = new Uint8ClampedArray(tw * th * 4);
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) for (let c = 0; c < 4; c++) tpl[(y * tw + x) * 4 + c] = data[((y + oy) * W + x + ox) * 4 + c];
    const bank = new TemplateBank();
    bank.define({ key: "t", stored: storeTemplate({ width: tw, height: th, data: tpl }, false) });
    const [hit] = runSearch(bank, [{ key: "r", width: W, height: H, data }], [{ buffId: "b", regionKey: "r", templateKey: "t" }]);
    expect(hit.best).toMatchObject({ x: ox, y: oy });
    expect(hit.best!.score).toBeGreaterThan(0.95);
  });
});
