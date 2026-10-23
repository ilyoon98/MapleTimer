import { useState } from "react";
import { loadReplay } from "./replayStream";

/** 개발용 (?replay): 진단 파일을 골라 그 30초를 화면 공유처럼 재생 */
export function ReplayLoader() {
  const [msg, setMsg] = useState("진단 파일을 고르면 그때의 설정·학습 숫자로 바뀌고, '화면 공유 시작'을 누르면 30초 녹화가 재생돼요.");
  return (
    <div className="replay-loader">
      <b>진단 재생</b>
      <input
        type="file"
        accept=".json,application/json"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            setMsg(`불러옴: ${await loadReplay(await f.text())} → '화면 공유 시작'을 누르세요`);
          } catch (err) {
            setMsg(`불러오기 실패: ${(err as Error).message}`);
          }
        }}
      />
      <span className="muted small">{msg}</span>
    </div>
  );
}
