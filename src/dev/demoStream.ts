/**
 * 개발용 가짜 게임 화면 (주소에 ?demo 를 붙였을 때만 사용).
 * 실제 화면 공유 없이 영역 선택 → 감지 → 알림 흐름을 시험하기 위한 것.
 *  - 미니맵(좌상단): 10초마다 보라색 룬이 나타났다 사라짐
 *  - 퀵슬롯(우하단): 'k' 키를 누르면 스킬 사용(아이콘 어두워짐, 쿨 15초, 숫자 표시)
 *  - 경험치(하단): 2초마다 숫자 증가, 's' 키로 멈춤/재개
 *  - 버프칸(우상단): 'b' 키로 버프 아이콘 켜고 끄기
 *  - 부스터(위쪽 가운데): 시작 5초 뒤부터 60초 "SS.cc" 카운트다운
 * 숫자는 실제 게임 모양으로 그린다 (쿨타임·버프: 기본 숫자 모양의 노란 글자 + 검은 테두리, 부스터: 디지털 시계 모양).
 * 그래서 숫자 학습 없이도 기본 숫자 읽기를 그대로 시험할 수 있다.
 */
import { GH, GW } from "../cv/digits";
import { gameDigitTemplates } from "../cv/gameDigits";

/** 실제 게임 쿨타임·버프 숫자처럼: 기본 숫자 모양을 높이 h 로 키워 노란 글자 + 1픽셀 검은 테두리로 (cx, cy 가운데) */
function drawGameText(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, h: number) {
  const T = gameDigitTemplates();
  const bw = Math.round((h * GW) / GH);
  const widths = [...text].map((ch) => (ch === ":" ? 2 : bw));
  const total = widths.reduce((a, b) => a + b + 1, -1);
  const y0 = Math.round(cy - h / 2);
  const lit: Array<[number, number]> = [];
  let x = Math.round(cx - total / 2);
  [...text].forEach((ch, i) => {
    if (ch === ":") {
      for (const dy of [Math.round(h * 0.25), Math.round(h * 0.65)]) lit.push([x, y0 + dy], [x + 1, y0 + dy], [x, y0 + dy + 1], [x + 1, y0 + dy + 1]);
    } else {
      const t = T[Number(ch)][0];
      for (let y = 0; y < h; y++)
        // 평균 모양이라 획 가운데가 옅은 칸이 있다: 0.25 이상을 글자로 봐야 4·2 같은 숫자가 두 조각으로 끊기지 않는다
        for (let xx = 0; xx < bw; xx++) if (t[Math.floor((y / h) * GH) * GW + Math.floor((xx / bw) * GW)] >= 0.25) lit.push([x + xx, y0 + y]);
    }
    x += widths[i] + 1;
  });
  ctx.fillStyle = "#000";
  for (const [px, py] of lit) ctx.fillRect(px - 1, py - 1, 3, 3);
  ctx.fillStyle = "rgb(216,211,62)";
  for (const [px, py] of lit) ctx.fillRect(px, py, 1, 1);
}

// 막대 순서 a b c d e f g
const SEGS: Record<string, string> = {
  "0": "1111110",
  "1": "0110000",
  "2": "1101101",
  "3": "1111001",
  "4": "0110011",
  "5": "1011011",
  "6": "1011111",
  "7": "1110000",
  "8": "1111111",
  "9": "1111011",
};

/** 실제 부스터 남은시간처럼: 어두운 상자에 디지털 시계 모양 숫자 (막대 위쪽 흰색 → 아래쪽 주황) */
function drawSevenSegment(ctx: CanvasRenderingContext2D, text: string, x0: number, top: number) {
  const CW = 26,
    CH = 42,
    T = 6;
  ctx.fillStyle = "rgb(10,12,10)";
  ctx.fillRect(x0 - 12, top - 10, 24 + text.length * 31, CH + 20);
  const rect = (xa: number, ya: number, xb: number, yb: number) => {
    for (let y = ya; y <= yb; y++) {
      const t = (y - top) / CH;
      ctx.fillStyle = `rgb(255,${Math.round(255 - 68 * t)},${Math.round(250 - 248 * t)})`;
      ctx.fillRect(xa, y, xb - xa + 1, 1);
    }
  };
  let x = x0;
  for (const ch of text) {
    if (ch === ".") {
      rect(x + 1, top + CH - 6, x + 7, top + CH - 1);
      x += 11;
      continue;
    }
    const s = SEGS[ch];
    const mid = top + (CH >> 1);
    const L = x,
      R = x + CW - 1;
    if (s[0] === "1") rect(L + 2, top, R - 2, top + T - 1);
    if (s[6] === "1") rect(L + 2, mid - 3, R - 2, mid + 2);
    if (s[3] === "1") rect(L + 2, top + CH - T, R - 2, top + CH - 1);
    if (s[5] === "1") rect(L, top + T + 1, L + T - 1, mid - 5);
    if (s[1] === "1") rect(R - T + 1, top + T + 1, R, mid - 5);
    if (s[4] === "1") rect(L, mid + 4, L + T - 1, top + CH - T - 2);
    if (s[2] === "1") rect(R - T + 1, mid + 4, R, top + CH - T - 2);
    x += CW + 5;
  }
}

export function createDemoStream(): MediaStream {
  const W = 1280,
    H = 720;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  let castAt = -1e9;
  let stalled = false;
  let buffOn = true;
  let exp = 1234567;
  let lastExp = 0;
  let buffStart = performance.now();
  window.addEventListener("keydown", (e) => {
    if (e.key === "k") castAt = performance.now();
    if (e.key === "s") stalled = !stalled;
    if (e.key === "b") {
      buffOn = !buffOn;
      buffStart = performance.now();
    }
  });

  const drawIcon = (x: number, y: number, hue: number, dim: number) => {
    for (let i = 0; i < 32; i++)
      for (let j = 0; j < 32; j++) {
        const l = 35 + 25 * Math.sin((i + hue) * 0.4) * Math.cos(j * 0.3);
        ctx.fillStyle = `hsl(${(hue + i * 4) % 360} 70% ${l * dim}%)`;
        ctx.fillRect(x + i, y + j, 1, 1);
      }
  };

  const t0 = performance.now();
  const draw = () => {
    const now = performance.now();
    const t = now;
    const sinceStart = now - t0;
    ctx.fillStyle = "#3a5a40";
    ctx.fillRect(0, 0, W, H);
    // 미니맵
    ctx.fillStyle = "#222";
    ctx.fillRect(10, 30, 220, 140);
    ctx.fillStyle = "#556b55";
    ctx.fillRect(20, 50, 200, 110);
    ctx.fillStyle = "#ffd400";
    ctx.fillRect(60 + ((t / 100) % 120), 120, 4, 4); // 캐릭터 점
    if (Math.floor(t / 10000) % 2 === 1) {
      ctx.fillStyle = "#c83ce6";
      ctx.fillRect(150, 80, 7, 7); // 룬
    }
    // 버프칸
    ctx.fillStyle = "#111";
    ctx.fillRect(860, 10, 400, 80);
    drawIcon(880, 20, 20, 1);
    // 가운데 버프: 70초짜리, 남은 시간을 m:ss 로 표시 ('b' 로 끄고 켜면 다시 70초)
    const buffLeft = Math.ceil((70000 - (t - buffStart)) / 1000);
    if (buffOn && buffLeft <= 0) buffOn = false;
    if (buffOn) {
      drawIcon(920, 20, 200, 1);
      const txt = buffLeft >= 60 ? `${Math.floor(buffLeft / 60)}:${String(buffLeft % 60).padStart(2, "0")}` : String(buffLeft);
      drawGameText(ctx, txt, 936, 37, 10);
    }
    drawIcon(960, 20, 120, 1);
    // 부스터 타이머 (위쪽 가운데 상자, 60초짜리 "SS.cc" 형식, 시작하고 5초 뒤부터)
    const boostLeft = 65000 - sinceStart;
    if (boostLeft > 0 && boostLeft <= 60000) drawSevenSegment(ctx, (boostLeft / 1000).toFixed(2), 560, 16);
    // 퀵슬롯 (쿨타임 15초, 가운데 큰 숫자)
    const cooling = t - castAt < 15000;
    drawIcon(1100, 640, 290, cooling ? 0.45 : 1);
    if (cooling) drawGameText(ctx, String(Math.ceil((15000 - (t - castAt)) / 1000)), 1116, 657, 13);
    // 경험치바
    if (!stalled && t - lastExp > 2000) {
      exp += 1357;
      lastExp = t;
    }
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 700, W, 20);
    ctx.fillStyle = "#e8e800";
    ctx.fillRect(0, 704, (exp % 100000) / 100000 * W, 12);
    ctx.fillStyle = "#fff";
    ctx.font = "12px monospace";
    ctx.fillText(`${exp.toLocaleString()} [${((exp % 100000) / 1000).toFixed(3)}%]`, 560, 714);
  };
  setInterval(draw, 100);
  draw();
  return c.captureStream(10);
}
