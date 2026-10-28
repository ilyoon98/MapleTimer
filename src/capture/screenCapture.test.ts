import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function source() {
  const track = { stop: vi.fn(), addEventListener: vi.fn() };
  const stream = { getVideoTracks: () => [track], getTracks: () => [track] };
  let receive!: (value: { done: boolean; value?: unknown }) => void;
  const reader = {
    read: vi.fn(() => new Promise<{ done: boolean; value?: unknown }>((resolve) => { receive = resolve; })),
    cancel: vi.fn(async () => { receive?.({ done: true }); }),
  };
  return { track, stream, reader, receive: (value: { done: boolean; value?: unknown }) => receive(value) };
}

describe("화면 수신 수명 관리", () => {
  let capture: import("./screenCapture").ScreenCapture;
  let first: ReturnType<typeof source>;
  let second: ReturnType<typeof source>;
  let display: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    first = source();
    second = source();
    const queue = [first.reader, second.reader];
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => ({}) }) });
    vi.stubGlobal("location", { search: "" });
    display = vi.fn().mockResolvedValueOnce(first.stream).mockResolvedValueOnce(second.stream);
    vi.stubGlobal("navigator", { mediaDevices: { getDisplayMedia: display } });
    vi.stubGlobal("MediaStreamTrackProcessor", class {
      readable = { getReader: () => queue.shift()! };
    });
    const { ScreenCapture } = await import("./screenCapture");
    capture = new ScreenCapture();
  });

  afterEach(() => {
    capture.stop();
    vi.unstubAllGlobals();
  });

  it("타이머 없이 프레임 도착 신호를 전달한다", async () => {
    const wake = vi.fn();
    capture.onFrame(wake);
    await capture.start();
    const frame = { close: vi.fn() };
    first.receive({ done: false, value: frame });
    await Promise.resolve();
    expect(wake).toHaveBeenCalledTimes(1);
    capture.stop();
    expect(frame.close).toHaveBeenCalledTimes(1);
  });

  it("수신이 조용히 끝나면 공유 중으로 남지 않고 종료를 알린다", async () => {
    await capture.start();
    first.receive({ done: true });
    await Promise.resolve();
    expect(capture.state).toBe("ended");
    expect(capture.error).toContain("수신이 중단");
    expect(first.track.stop).toHaveBeenCalled();
  });

  it("다시 공유할 때 이전 reader의 종료가 새 세션을 끊지 않는다", async () => {
    await capture.start();
    await capture.start();
    await Promise.resolve();
    expect(capture.state).toBe("live");
    expect(capture.mediaStream).toBe(second.stream);
    expect(second.track.stop).not.toHaveBeenCalled();
  });

  it("선택 창에서 기다리는 도중 취소한 공유가 뒤늦게 되살아나지 않는다", async () => {
    let select!: (value: unknown) => void;
    display.mockReset().mockReturnValue(new Promise((resolve) => { select = resolve; }));
    const starting = capture.start();
    capture.stop();
    select(first.stream);
    await starting;
    expect(capture.state).toBe("idle");
    expect(capture.mediaStream).toBeNull();
    expect(first.track.stop).toHaveBeenCalled();
  });
});
