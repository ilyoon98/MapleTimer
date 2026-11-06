import { describe, expect, it } from "vitest";
import { latestInstallerUrl } from "./download";

const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("앱 다운로드 주소", () => {
  it("최신 릴리스에서 설치 파일(.exe)만 고른다", async () => {
    const url = await latestInstallerUrl(reply(200, { assets: [
      { name: "latest.yml", browser_download_url: "y" },
      { name: "MapleTimer-Setup-0.3.4.exe.blockmap", browser_download_url: "b" },
      { name: "MapleTimer-Setup-0.3.4.exe", browser_download_url: "https://github.com/x/exe" },
    ] }));
    expect(url).toBe("https://github.com/x/exe");
  });
  it("GitHub 응답이 실패하거나 파일이 없으면 null (릴리스 페이지로 보낸다)", async () => {
    expect(await latestInstallerUrl(reply(403, {}))).toBeNull();
    expect(await latestInstallerUrl(reply(200, { assets: [] }))).toBeNull();
    expect(await latestInstallerUrl((async () => { throw new Error("offline"); }) as unknown as typeof fetch)).toBeNull();
  });
});
