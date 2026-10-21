/**
 * 개발용 가짜 게임 화면 (주소에 ?demo 를 붙였을 때만 사용).
 * 실제 화면 공유 없이 영역 선택 → 감지 → 알림 흐름을 시험하기 위한 것.
 *  - 미니맵(좌상단): 10초마다 보라색 룬이 나타났다 사라짐
 *  - 퀵슬롯(우하단): 'k' 키를 누르면 스킬 사용(아이콘 어두워짐, 쿨 15초, 숫자 표시)
 *  - 경험치(하단): 2초마다 숫자 증가, 's' 키로 멈춤/재개
 *  - 버프칸(우상단): 'b' 키로 버프 아이콘 켜고 끄기
 *  - 부스터(위쪽 가운데): 시작 5초 뒤부터 60초 "SS.cc" 카운트다운
 */
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
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#000";
      ctx.strokeText(txt, 936, 37);
      ctx.fillStyle = "#fff";
      ctx.fillText(txt, 936, 37);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    }
    drawIcon(960, 20, 120, 1);
    // 부스터 타이머 (위쪽 가운데, 60초짜리 "SS.cc" 형식, 시작하고 5초 뒤부터)
    const boostLeft = 65000 - sinceStart;
    if (boostLeft > 0 && boostLeft <= 60000) {
      const txt = (boostLeft / 1000).toFixed(2).padStart(5, "0");
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#000";
      ctx.strokeText(txt, 640, 40);
      ctx.fillStyle = "#fff";
      ctx.fillText(txt, 640, 40);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    }
    // 퀵슬롯 (쿨타임 15초, 가운데 큰 숫자)
    const cooling = t - castAt < 15000;
    drawIcon(1100, 640, 290, cooling ? 0.45 : 1);
    if (cooling) {
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#000";
      const txt = String(Math.ceil((15000 - (t - castAt)) / 1000));
      ctx.strokeText(txt, 1116, 657);
      ctx.fillStyle = "#fff";
      ctx.fillText(txt, 1116, 657);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    }
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
