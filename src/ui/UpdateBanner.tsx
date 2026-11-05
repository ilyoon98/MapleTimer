import { useEffect, useState } from "react";
import { desktop, type UpdateInfo } from "../platform/desktop";

/** 실행판: 새 버전을 다 받아 두면 한 줄로 알린다 (그냥 꺼도 다음에 켤 때 바뀐다) */
export function UpdateBanner() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  useEffect(() => {
    if (!desktop?.updateStatus) return;
    void desktop.updateStatus().then((v) => v && setInfo(v)).catch(() => {});
    desktop.onUpdateReady?.(setInfo);
  }, []);
  if (!info) return null;
  return (
    <section className="notice notice-update" aria-live="polite">
      <div className="notice-row">
        <span className="notice-mark" aria-hidden>
          ↑
        </span>
        <span className="notice-text">새 버전{info.version ? ` ${info.version}` : ""}이 준비됐어요 · 끄면 저절로 바뀌어요</span>
        <button className="primary" onClick={() => void desktop?.installUpdate?.()}>
          지금 다시 시작
        </button>
      </div>
    </section>
  );
}
