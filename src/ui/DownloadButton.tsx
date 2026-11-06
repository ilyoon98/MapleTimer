import { useState } from "react";
import { desktop } from "../platform/desktop";

import { latestInstallerUrl, RELEASES_PAGE } from "./download";

/** 웹사이트 오른쪽 위: 누르면 GitHub 의 최신 설치 파일을 바로 받는다. 앱 안에서는 보이지 않는다 */
export function DownloadButton() {
  const [busy, setBusy] = useState(false);
  if (desktop) return null;
  const download = async () => {
    if (busy) return;
    setBusy(true);
    const url = await latestInstallerUrl();
    setBusy(false);
    // 파일 주소를 못 얻으면 릴리스 페이지를 연다 (거기서 받을 수 있다)
    if (url) window.location.href = url;
    else window.open(RELEASES_PAGE, "_blank", "noopener");
  };
  return (
    <button className="primary download-btn" onClick={download} disabled={busy} title="Windows 용 설치 파일을 받아요">
      {busy ? "준비 중…" : "⬇ 앱 다운로드"}
    </button>
  );
}
