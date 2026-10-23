/**
 * 개발용: 진단 파일의 최근 30초 녹화를 화면 공유처럼 다시 재생한다 (주소에 ?replay 를 붙였을 때만).
 * 녹화한 영역 그림을 원래 위치에 그리고, 나머지는 그때의 화면 평균 밝기로 채운다 (맵 이동 암전도 재현).
 * 끝까지 재생하면 마지막 장면에서 멈춘다.
 */
import { emitAlertLog } from "../alerts/alertRunner";
import { importLearnedDigits } from "../detect/digitLearner";
import type { ClipData } from "../engine/clip";
import { migrate, profileStore } from "../state/profile";

interface Loaded {
  clip: ClipData;
  bitmaps: Array<Record<string, ImageBitmap>>;
}
let loaded: Loaded | null = null;

/** 진단 파일(JSON 문자열 또는 객체)을 불러와 설정·학습 숫자를 그때 것으로 바꾸고 재생 준비 */
export async function loadReplay(raw: string | object): Promise<string> {
  const d = (typeof raw === "string" ? JSON.parse(raw) : raw) as { kind?: string; clip?: ClipData; profile?: unknown; learnedDigits?: unknown };
  if (d.kind !== "maple-timer-diagnostics") throw new Error("진단 파일이 아니에요");
  if (!d.clip?.frames.length) throw new Error("이 진단 파일에는 30초 녹화가 없어요 (예전 버전에서 저장한 파일)");
  const toBitmap = async (url: string) => createImageBitmap(await (await fetch(url)).blob());
  const bitmaps = await Promise.all(
    d.clip.frames.map(async (f) => Object.fromEntries(await Promise.all(Object.entries(f.crops).map(async ([k, url]) => [k, await toBitmap(url)] as const)))),
  );
  loaded = { clip: d.clip, bitmaps };
  if (d.profile) profileStore.set(() => migrate(d.profile));
  if (d.learnedDigits) importLearnedDigits(d.learnedDigits);
  const sec = Math.round((d.clip.frames[d.clip.frames.length - 1].t - d.clip.frames[0].t) / 1000);
  return `${sec}초, 영역 ${Object.keys(d.clip.regions).length}개, ${d.clip.width}×${d.clip.height}`;
}

export function createReplayStream(): MediaStream {
  if (!loaded) throw new Error("먼저 진단 파일을 불러와 주세요");
  const { clip, bitmaps } = loaded;
  const c = document.createElement("canvas");
  c.width = clip.width;
  c.height = clip.height;
  const ctx = c.getContext("2d")!;
  const t0 = clip.frames[0].t;
  const start = performance.now();
  let ended = false;
  const draw = () => {
    const elapsed = performance.now() - start;
    let i = 0;
    while (i + 1 < clip.frames.length && clip.frames[i + 1].t - t0 <= elapsed) i++;
    const f = clip.frames[i];
    ctx.fillStyle = `rgb(${f.mean},${f.mean},${f.mean})`;
    ctx.fillRect(0, 0, c.width, c.height);
    for (const [k, bmp] of Object.entries(bitmaps[i])) {
      const r = clip.regions[k];
      if (r) ctx.drawImage(bmp, r.x, r.y);
    }
    if (!ended && i === clip.frames.length - 1) {
      ended = true;
      emitAlertLog("진단 녹화 재생 끝 (마지막 장면에서 멈춤)");
    }
  };
  setInterval(draw, 100);
  draw();
  return c.captureStream(10);
}
